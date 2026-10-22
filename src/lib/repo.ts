import { query, queryOne } from "./db";
import { ApiError, isUuid } from "./api";

export interface ProjectRow {
  id: string;
  user_id: string;
  source_url: string | null;
  source_type: "youtube" | "upload" | "url";
  youtube_video_id: string | null;
  direct_url: string | null;
  title: string;
  channel: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: string;
  source_storage_key: string | null;
  transcript: unknown;
  video_summary: string | null;
  settings: Record<string, unknown>;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClipRow {
  id: string;
  project_id: string;
  title: string;
  start_seconds: string;
  end_seconds: string;
  hook: string | null;
  summary: string | null;
  reason: string | null;
  transcript: string | null;
  engagement_score: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  crop_mode: "center" | "blur";
  caption_style: Record<string, unknown>;
  status: string;
  output_storage_key: string | null;
  subtitle_storage_key: string | null;
  output_width: number | null;
  output_height: number | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface JobRow {
  id: string;
  project_id: string;
  clip_id: string | null;
  job_type: "analyze" | "render";
  status: string;
  progress: number;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
}

/** Authorization boundary: returns the project only if it belongs to the user. */
export async function getOwnedProject(userId: string, id: string): Promise<ProjectRow> {
  if (!isUuid(id)) throw new ApiError(404, "Project not found.");
  const row = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!row) throw new ApiError(404, "Project not found.");
  return row;
}

/** Authorization boundary: returns the clip (and its project) only if the project belongs to the user. */
export async function getOwnedClip(userId: string, id: string): Promise<{ clip: ClipRow; project: ProjectRow }> {
  if (!isUuid(id)) throw new ApiError(404, "Clip not found.");
  const clip = await queryOne<ClipRow>(
    `SELECT c.* FROM clips c JOIN projects p ON p.id = c.project_id WHERE c.id = $1 AND p.user_id = $2`,
    [id, userId],
  );
  if (!clip) throw new ApiError(404, "Clip not found.");
  const project = await getOwnedProject(userId, clip.project_id);
  return { clip, project };
}

export async function getOwnedJob(userId: string, id: string): Promise<JobRow> {
  if (!isUuid(id)) throw new ApiError(404, "Job not found.");
  const job = await queryOne<JobRow>(
    `SELECT j.* FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.id = $1 AND p.user_id = $2`,
    [id, userId],
  );
  if (!job) throw new ApiError(404, "Job not found.");
  return job;
}

export async function latestJobs(projectId: string): Promise<JobRow[]> {
  return query<JobRow>(
    `SELECT DISTINCT ON (job_type, COALESCE(clip_id, project_id)) *
     FROM jobs WHERE project_id = $1
     ORDER BY job_type, COALESCE(clip_id, project_id), created_at DESC`,
    [projectId],
  );
}

const num = (v: string | number) => (typeof v === "number" ? v : parseFloat(v));

export function publicProject(p: ProjectRow) {
  return {
    id: p.id,
    sourceUrl: p.source_url,
    sourceType: p.source_type,
    directUrl: p.direct_url,
    title: p.title,
    channel: p.channel,
    thumbnailUrl: p.thumbnail_url,
    durationSeconds: p.duration_seconds,
    status: p.status,
    hasSource: !!p.source_storage_key,
    hasTranscript: !!p.transcript,
    videoSummary: p.video_summary,
    settings: p.settings,
    errorMessage: p.error_message,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function publicClip(c: ClipRow) {
  return {
    id: c.id,
    projectId: c.project_id,
    title: c.title,
    startSeconds: num(c.start_seconds),
    endSeconds: num(c.end_seconds),
    durationSeconds: Math.round((num(c.end_seconds) - num(c.start_seconds)) * 1000) / 1000,
    hook: c.hook,
    summary: c.summary,
    reason: c.reason,
    transcript: c.transcript,
    engagementScore: c.engagement_score,
    aspectRatio: c.aspect_ratio,
    cropMode: c.crop_mode,
    captionStyle: c.caption_style,
    status: c.status,
    rendered: !!c.output_storage_key,
    outputWidth: c.output_width,
    outputHeight: c.output_height,
    errorMessage: c.error_message,
    createdAt: c.created_at,
  };
}

export function publicJob(j: JobRow) {
  return {
    id: j.id,
    projectId: j.project_id,
    clipId: j.clip_id,
    jobType: j.job_type,
    status: j.status,
    progress: j.progress,
    errorMessage: j.error_message,
    retryCount: j.retry_count,
    updatedAt: j.updated_at,
  };
}
