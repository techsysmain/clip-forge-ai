import { ApiError } from "./api";
import { query } from "./db";
import { enqueueJob } from "./queue";
import type { ClipRow, ProjectRow } from "./repo";

/** Queues a render for a clip. Idempotent: an in-flight render is returned instead of duplicated. */
export async function requestRender(clip: ClipRow, project: ProjectRow) {
  if (!project.source_storage_key || !project.transcript) {
    throw new ApiError(409, "A permitted video source and transcript are required before rendering.", "SOURCE_REQUIRED");
  }
  const { job, created } = await enqueueJob("render", project.id, clip.id);
  if (created) {
    await query("UPDATE clips SET status = 'queued', error_message = NULL, updated_at = now() WHERE id = $1", [clip.id]);
  }
  return { job, created };
}
