import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query, queryOne } from "../lib/db";
import { env } from "../lib/env";
import { analyzeTranscript, PipelineError, transcribeAudio } from "../lib/ai";
import { extractAudio, OUTPUT_SIZES, probe, renderClip, type AspectRatio, type CropMode } from "../lib/ffmpeg";
import { completeJob, failJob, updateJob } from "../lib/queue";
import type { ClipRow, JobRow, ProjectRow } from "../lib/repo";
import { resolveSource } from "../lib/sources";
import { ensureParent, freeBytes, storagePath } from "../lib/storage";
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
  await query("UPDATE projects SET status = $2, error_message = $3, updated_at = now() WHERE id = $1", [id, status, error]);
}

async function stage(job: JobRow, projectId: string, status: string, progress: number) {
  await updateJob(job.id, status, progress);
  await setProjectStatus(projectId, status);
}

async function processAnalyze(job: JobRow) {
  const project = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = $1", [job.project_id]);
  if (!project) throw new PipelineError("The project no longer exists.");
  const settings = project.settings as { maxClipSeconds?: number; aspectRatio?: string; captionPreset?: string; cropMode?: string };
  const maxClip = Math.min(60, Math.max(10, Number(settings.maxClipSeconds) || 60));

  // 1. Source
  await stage(job, project.id, "fetching_source", 5);
  const key = await resolveSource(project, (f) => void updateJob(job.id, "fetching_source", 5 + f * 15));
  if (key !== project.source_storage_key) {
    await query("UPDATE projects SET source_storage_key = $2 WHERE id = $1", [project.id, key]);
  }
  const file = storagePath(key);
  const info = await probe(file);
  if (info.duration > env.maxSourceSeconds) {
    throw new PipelineError(`This video is longer than the ${Math.round(env.maxSourceSeconds / 60)} minute limit.`);
  }
  if (!info.hasAudio) throw new PipelineError("This video has no audio track to transcribe.");
  await query("UPDATE projects SET duration_seconds = $2 WHERE id = $1", [project.id, Math.max(1, Math.ceil(info.duration))]);

  // 2. Transcript
  let transcript = project.transcript as Transcript | null;
  if (!transcript) {
    await stage(job, project.id, "transcribing", 25);
    transcript = await withTmp("audio", async (dir) => {
      const audio = path.join(dir, "audio.mp3");
      await extractAudio(file, audio);
      await updateJob(job.id, "transcribing", 40);
      return transcribeAudio(audio);
    });
    await query("UPDATE projects SET transcript = $2 WHERE id = $1", [project.id, JSON.stringify(transcript)]);
  }

  // 3. Analysis
  await stage(job, project.id, "analyzing", 70);
  const result = await analyzeTranscript(project.title, transcript, info.duration, maxClip);

  await query("DELETE FROM clips WHERE project_id = $1 AND status = 'suggested'", [project.id]);
  const fixedAspect = ["9:16", "16:9", "1:1"].includes(settings.aspectRatio ?? "");
  for (const c of result.clips) {
    const preset = settings.captionPreset && settings.captionPreset !== "auto" ? settings.captionPreset : c.captionPreset;
    await query(
      `INSERT INTO clips (project_id, title, start_seconds, end_seconds, hook, summary, reason, transcript,
         engagement_score, aspect_ratio, crop_mode, caption_style)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        project.id, c.title, c.startSeconds, c.endSeconds, c.hook, c.summary, c.reason, c.transcript,
        c.engagementScore,
        fixedAspect ? settings.aspectRatio : c.aspectRatio,
        settings.cropMode === "blur" ? "blur" : "center",
        JSON.stringify(resolveStyle({ preset })),
      ],
    );
  }
  await query("UPDATE projects SET video_summary = $2 WHERE id = $1", [project.id, result.videoSummary]);
  await setProjectStatus(project.id, "ready");
}

async function processRender(job: JobRow) {
  const clip = await queryOne<ClipRow>("SELECT * FROM clips WHERE id = $1", [job.clip_id]);
  if (!clip) throw new PipelineError("The clip no longer exists.");
  const project = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = $1", [clip.project_id]);
  if (!project?.source_storage_key || !project.transcript) {
    throw new PipelineError("A permitted video source is required before rendering.");
  }
  const free = await freeBytes();
  if (free !== null && free < 200 * 1024 * 1024) throw new PipelineError("There is not enough storage space to render.", true);

  await query("UPDATE clips SET status = 'rendering', error_message = NULL, updated_at = now() WHERE id = $1", [clip.id]);
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

  await withTmp("render", async (dir) => {
    await fs.promises.writeFile(path.join(dir, "subs.ass"), toAss(captions, style, width, height), "utf8");
    await renderClip({
      input: storagePath(project.source_storage_key!),
      start,
      end,
      width,
      height,
      cropMode: clip.crop_mode as CropMode,
      workDir: dir,
      onProgress: (f) => void updateJob(job.id, "rendering", 10 + f * 85),
    });
    const finalPath = await ensureParent(outKey);
    await fs.promises.copyFile(path.join(dir, "out.mp4"), `${finalPath}.partial`);
    await fs.promises.rename(`${finalPath}.partial`, finalPath);
  });
  await fs.promises.writeFile(await ensureParent(srtKey), toSrt(captions), "utf8");

  await query(
    `UPDATE clips SET status = 'rendered', output_storage_key = $2, subtitle_storage_key = $3,
       output_width = $4, output_height = $5, error_message = NULL, updated_at = now() WHERE id = $1`,
    [clip.id, outKey, srtKey, width, height],
  );
}

export async function runJob(job: JobRow) {
  try {
    if (job.job_type === "analyze") await processAnalyze(job);
    else await processRender(job);
    await completeJob(job.id);
  } catch (e) {
    const known = e instanceof PipelineError;
    const message = known ? e.message : "An unexpected processing error occurred.";
    if (!known) console.error(`[worker] job ${job.id} crashed:`, e);
    const recoverable = known ? e.recoverable : true;
    const willRetry = await failJob(job, message, recoverable);
    if (job.job_type === "analyze") {
      await setProjectStatus(job.project_id, willRetry ? "queued" : "failed", willRetry ? null : message);
    } else if (job.clip_id) {
      await query("UPDATE clips SET status = $2, error_message = $3, updated_at = now() WHERE id = $1", [
        job.clip_id,
        willRetry ? "queued" : "failed",
        willRetry ? null : message,
      ]);
    }
  }
}
