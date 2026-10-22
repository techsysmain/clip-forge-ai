import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exec, queryOne } from "@/lib/db";
import { OUTPUT_SIZES } from "@/lib/ffmpeg";
import { getOwnedClip, publicClip, publicJob, publicProject, type ClipRow, type JobRow } from "@/lib/repo";
import { removeKey } from "@/lib/storage";
import { buildCaptions, charsPerLine, resolveStyle, type Transcript } from "@/lib/subtitles";
import { normalizeRange } from "@/lib/timestamps";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { clip, project } = await getOwnedClip(user.id, (await params).id);
  const start = parseFloat(clip.start_seconds);
  const end = parseFloat(clip.end_seconds);
  const style = resolveStyle(clip.caption_style);
  const { width } = OUTPUT_SIZES[clip.aspect_ratio];
  const captions = project.transcript
    ? buildCaptions(project.transcript as Transcript, start, end, { maxCharsPerLine: charsPerLine(width, style) })
    : [];
  const job = await queryOne<JobRow>(
    "SELECT * FROM jobs WHERE clip_id = ? AND job_type = 'render' ORDER BY created_at DESC LIMIT 1",
    [clip.id],
  );
  return NextResponse.json({
    clip: { ...publicClip(clip), captionStyle: style },
    project: publicProject(project),
    captions,
    job: job ? publicJob(job) : null,
  });
});

const patchSchema = z.object({
  startSeconds: z.number().min(0).optional(),
  endSeconds: z.number().min(0).optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
  cropMode: z.enum(["center", "blur", "face"]).optional(),
  captionStyle: z.record(z.unknown()).optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { clip, project } = await getOwnedClip(user.id, (await params).id);
  if (clip.status === "queued" || clip.status === "rendering") {
    throw new ApiError(409, "This clip is being rendered. Wait for it to finish before editing.");
  }
  const body = patchSchema.parse(await req.json().catch(() => ({})));

  let start = parseFloat(clip.start_seconds);
  let end = parseFloat(clip.end_seconds);
  if (body.startSeconds !== undefined || body.endSeconds !== undefined) {
    const s = body.startSeconds ?? start;
    const e = body.endSeconds ?? end;
    if (e <= s) throw new ApiError(400, "The end time must be after the start time.");
    if (e - s > 60) throw new ApiError(400, "Clips can be at most 60 seconds long.");
    const duration = project.duration_seconds ?? Infinity;
    if (e > duration + 0.5) throw new ApiError(400, "The end time is past the end of the video.");
    const r = normalizeRange(s, e, duration, 60);
    if (!r) throw new ApiError(400, "Clips must be at least 5 seconds long.");
    start = r.start;
    end = r.end;
  }
  const style = body.captionStyle ? resolveStyle({ ...clip.caption_style, ...body.captionStyle }) : clip.caption_style;

  // Edits invalidate any previous render.
  await removeKey(clip.output_storage_key);
  await removeKey(clip.subtitle_storage_key);
  await exec(
    `UPDATE clips SET start_seconds = ?, end_seconds = ?, aspect_ratio = ?, crop_mode = ?, caption_style = ?,
       title = ?, status = 'suggested', output_storage_key = NULL, subtitle_storage_key = NULL,
       output_width = NULL, output_height = NULL, error_message = NULL
     WHERE id = ?`,
    [
      start,
      end,
      body.aspectRatio ?? clip.aspect_ratio,
      body.cropMode ?? clip.crop_mode,
      JSON.stringify(style),
      body.title ?? clip.title,
      clip.id,
    ],
  );
  const row = await queryOne<ClipRow>("SELECT * FROM clips WHERE id = ?", [clip.id]);
  return NextResponse.json({ clip: publicClip(row!) });
});
