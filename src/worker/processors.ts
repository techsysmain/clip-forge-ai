import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec, newId, query, queryOne } from "../lib/db";
import { env } from "../lib/env";
import { analyzeTranscript, audioBitrateKbps, PipelineError, transcribeAudio } from "../lib/ai";
import { extractAudio, OUTPUT_SIZES, probe, renderClip, type AspectRatio, type CropMode, type RenderArgs } from "../lib/ffmpeg";
import { analyzeVideoFrames, detectFaceTrack, type VisualNote } from "../lib/vision";
import { notifyProjectOwner } from "../lib/notify";
import { completeJob, failJob, updateJob } from "../lib/queue";
import type { ClipRow, JobRow, ProjectRow } from "../lib/repo";
import { resolveSource } from "../lib/sources";
import { freeBytes, putFile, withLocalFile, writeText } from "../lib/storage";
import { buildCaptions, charsPerLine, resolveStyle, toAss, toSrt, type Transcript } from "../lib/subtitles";

async function withTmp<T>(label: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `clipforge-${label}-`));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function setProjectStatus(id: string, status: string, error: string | null = null) {
  await exec("UPDATE projects SET status = ?, error_message = ? WHERE id = ?", [status, error, id]);
}

async function stage(job: JobRow, projectId: string, status: string, progress: number) {
  await updateJob(job.id, status, progress);
  await setProjectStatus(projectId, status);
}

async function processAnalyze(job: JobRow) {
  const project = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = ?", [job.project_id]);
  if (!project) throw new PipelineError("The project no longer exists.");
  const settings = project.settings as { maxClipSeconds?: number; aspectRatio?: string; captionPreset?: string; cropMode?: string };
  const maxClip = Math.min(60, Math.max(10, Number(settings.maxClipSeconds) || 60));

  // 1. Source
  await stage(job, project.id, "fetching_source", 5);
  const key = await resolveSource(project, (f) => void updateJob(job.id, "fetching_source", 5 + f * 15));
  if (key !== project.source_storage_key) {
    await exec("UPDATE projects SET source_storage_key = ? WHERE id = ?", [key, project.id]);
  }
  const { info, transcript, visualNotes } = await withLocalFile(key, async (file) => {
    const info = await probe(file);
    if (info.duration > env.maxSourceSeconds) {
      throw new PipelineError(`This video is longer than the ${Math.round(env.maxSourceSeconds / 60)} minute limit.`);
    }
    if (!info.hasAudio) throw new PipelineError("This video has no audio track to transcribe.");
    await exec("UPDATE projects SET duration_seconds = ? WHERE id = ?", [Math.max(1, Math.ceil(info.duration)), project.id]);

    // 2. Transcript
    let transcript = project.transcript as Transcript | null;
    if (!transcript) {
      await stage(job, project.id, "transcribing", 25);
      transcript = await withTmp("audio", async (dir) => {
        const audio = path.join(dir, "audio.mp3");
        await extractAudio(file, audio, audioBitrateKbps());
        await updateJob(job.id, "transcribing", 40);
        return transcribeAudio(audio);
      });
      await exec("UPDATE projects SET transcript = ? WHERE id = ?", [JSON.stringify(transcript), project.id]);
    }

    // 3. Video frames: sampled frames are described by the vision model so clip selection sees the picture too.
    let visualNotes = project.visual_notes as VisualNote[] | null;
    if (!visualNotes) {
      await stage(job, project.id, "analyzing", 60);
      try {
        visualNotes = await withTmp("frames", (dir) => analyzeVideoFrames(file, info.duration, dir));
      } catch (e) {
        if (e instanceof PipelineError && e.recoverable) throw e;
        console.error(`[worker] frame analysis skipped for project ${project.id}:`, e instanceof Error ? e.message : e);
        visualNotes = [];
      }
      await exec("UPDATE projects SET visual_notes = ? WHERE id = ?", [JSON.stringify(visualNotes), project.id]);
    }
    return { info, transcript, visualNotes };
  });

  // 4. Analysis
  await stage(job, project.id, "analyzing", 75);
  const result = await analyzeTranscript(project.title, transcript, info.duration, maxClip, visualNotes);

  await exec("DELETE FROM clips WHERE project_id = ? AND status = 'suggested'", [project.id]);
  const fixedAspect = ["9:16", "16:9", "1:1"].includes(settings.aspectRatio ?? "");
  for (const c of result.clips) {
    const preset = settings.captionPreset && settings.captionPreset !== "auto" ? settings.captionPreset : c.captionPreset;
    await exec(
      `INSERT INTO clips (id, project_id, title, start_seconds, end_seconds, hook, summary, reason, transcript,
         engagement_score, aspect_ratio, crop_mode, caption_style)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(), project.id, c.title, c.startSeconds, c.endSeconds, c.hook, c.summary, c.reason, c.transcript,
        c.engagementScore,
        fixedAspect ? settings.aspectRatio : c.aspectRatio,
        settings.cropMode === "blur" || settings.cropMode === "face" ? settings.cropMode : "center",
        JSON.stringify(resolveStyle({ preset })),
      ],
    );
  }
  await exec("UPDATE projects SET video_summary = ? WHERE id = ?", [result.videoSummary, project.id]);
  await setProjectStatus(project.id, "ready");

  const n = result.clips.length;
  await notifyProjectOwner(project.id, (title) => ({
    subject: `Your clips are ready: ${title}`.slice(0, 120),
    heading: "Your clip suggestions are ready",
    paragraphs: [`We found ${n} promising moment${n === 1 ? "" : "s"} in "${title}". Review them and choose which to render.`],
    path: `/projects/${project.id}`,
    cta: "Review clips",
  }));
}

async function processRender(job: JobRow) {
  const clip = await queryOne<ClipRow>("SELECT * FROM clips WHERE id = ?", [job.clip_id]);
  if (!clip) throw new PipelineError("The clip no longer exists.");
  const project = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = ?", [clip.project_id]);
  if (!project?.source_storage_key || !project.transcript) {
    throw new PipelineError("A permitted video source is required before rendering.");
  }
  const free = await freeBytes();
  if (free !== null && free < 200 * 1024 * 1024) throw new PipelineError("There is not enough storage space to render.", true);

  await exec("UPDATE clips SET status = 'rendering', error_message = NULL WHERE id = ?", [clip.id]);
  const start = parseFloat(clip.start_seconds);
  const end = parseFloat(clip.end_seconds);
  if (!(end > start) || end - start > 60) throw new PipelineError("The clip range is invalid.");

  const aspect = clip.aspect_ratio as AspectRatio;
  const { width, height } = OUTPUT_SIZES[aspect];
  const style = resolveStyle(clip.caption_style);
  const captions = buildCaptions(project.transcript as Transcript, start, end, { maxCharsPerLine: charsPerLine(width, style) });
  const base = `projects/${project.id}/clips/${clip.id}`;
  const outKey = `${base}.mp4`;
  const srtKey = `${base}.srt`;

  await withLocalFile(project.source_storage_key, (input) =>
    withTmp("render", async (dir) => {
      await fs.promises.writeFile(path.join(dir, "subs.ass"), toAss(captions, style, width, height), "utf8");

      let track: RenderArgs["track"] = null;
      if (clip.crop_mode === "face") {
        const src = await probe(input);
        try {
          await updateJob(job.id, "rendering", 5);
          const points = await detectFaceTrack(input, start, end, dir);
          if (points) track = { points, srcWidth: src.width, srcHeight: src.height };
          else console.warn(`[worker] no face found for clip ${clip.id}; using center crop`);
        } catch (e) {
          if (e instanceof PipelineError && e.recoverable) throw e;
          console.error(`[worker] face detection failed for clip ${clip.id}; using center crop:`, e instanceof Error ? e.message : e);
        }
      }

      await renderClip({
        input,
        start,
        end,
        width,
        height,
        cropMode: clip.crop_mode as CropMode,
        track,
        workDir: dir,
        onProgress: (f) => void updateJob(job.id, "rendering", 10 + f * 85),
      });
      await putFile(outKey, path.join(dir, "out.mp4"), "video/mp4");
    }),
  );
  await writeText(srtKey, toSrt(captions));

  await exec(
    `UPDATE clips SET status = 'rendered', output_storage_key = ?, subtitle_storage_key = ?,
       output_width = ?, output_height = ?, error_message = NULL WHERE id = ?`,
    [outKey, srtKey, width, height, clip.id],
  );
}

/** Sends one email when the last pending render of a project finishes. */
async function notifyRenderDone(projectId: string) {
  const pending = await queryOne<{ n: number }>(
    "SELECT count(*) AS n FROM jobs WHERE project_id = ? AND job_type = 'render' AND status NOT IN ('completed','failed')",
    [projectId],
  );
  if (pending && Number(pending.n) > 0) return;
  const rows = await query<{ n: number }>("SELECT count(*) AS n FROM clips WHERE project_id = ? AND status = 'rendered'", [projectId]);
  const n = Number(rows[0]?.n ?? 0);
  if (n === 0) return;
  await notifyProjectOwner(projectId, (title) => ({
    subject: `Your clips are rendered: ${title}`.slice(0, 120),
    heading: "Your clips are ready to download",
    paragraphs: [`${n} rendered clip${n === 1 ? "" : "s"} from "${title}" ${n === 1 ? "is" : "are"} ready, with MP4 and SRT downloads.`],
    path: `/projects/${projectId}`,
    cta: "Open project",
  }));
}

export async function runJob(job: JobRow) {
  try {
    if (job.job_type === "analyze") await processAnalyze(job);
    else await processRender(job);
    await completeJob(job.id);
    if (job.job_type === "render") await notifyRenderDone(job.project_id);
  } catch (e) {
    const known = e instanceof PipelineError;
    const message = known ? e.message : "An unexpected processing error occurred.";
    if (!known) console.error(`[worker] job ${job.id} crashed:`, e);
    const recoverable = known ? e.recoverable : true;
    const willRetry = await failJob(job, message, recoverable);
    if (job.job_type === "analyze") {
      await setProjectStatus(job.project_id, willRetry ? "queued" : "failed", willRetry ? null : message);
      if (!willRetry) {
        await notifyProjectOwner(job.project_id, (title) => ({
          subject: `We couldn't analyze: ${title}`.slice(0, 120),
          heading: "Video analysis failed",
          paragraphs: [`"${title}" could not be analyzed: ${message}`],
          path: `/projects/${job.project_id}`,
          cta: "Open project",
        }));
      }
    } else if (job.clip_id) {
      await exec("UPDATE clips SET status = ?, error_message = ? WHERE id = ?", [
        willRetry ? "queued" : "failed",
        willRetry ? null : message,
        job.clip_id,
      ]);
    }
  }
}
