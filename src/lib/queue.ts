import { query, queryOne } from "./db";
import type { JobRow } from "./repo";

/**
 * Postgres-backed job queue (FOR UPDATE SKIP LOCKED). A partial unique index guarantees
 * at most one active job per (type, project, clip), which makes submissions idempotent.
 */
export async function enqueueJob(
  jobType: "analyze" | "render",
  projectId: string,
  clipId: string | null = null,
): Promise<{ job: JobRow; created: boolean }> {
  try {
    const job = await queryOne<JobRow>(
      "INSERT INTO jobs (project_id, clip_id, job_type) VALUES ($1, $2, $3) RETURNING *",
      [projectId, clipId, jobType],
    );
    return { job: job!, created: true };
  } catch (e) {
    if ((e as { code?: string }).code !== "23505") throw e;
    const existing = await queryOne<JobRow>(
      `SELECT * FROM jobs WHERE job_type = $1 AND project_id = $2 AND clip_id IS NOT DISTINCT FROM $3
       AND status NOT IN ('completed','failed') ORDER BY created_at DESC LIMIT 1`,
      [jobType, projectId, clipId],
    );
    if (!existing) throw e;
    return { job: existing, created: false };
  }
}

export async function claimJob(): Promise<JobRow | null> {
  return queryOne<JobRow>(
    `UPDATE jobs SET
       status = CASE job_type WHEN 'analyze' THEN 'fetching_source' ELSE 'rendering' END,
       heartbeat_at = now(), updated_at = now(), progress = 0
     WHERE id = (
       SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now()
       ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1
     ) RETURNING *`,
  );
}

export async function updateJob(id: string, status: string, progress: number) {
  await query(
    "UPDATE jobs SET status = $2, progress = $3, heartbeat_at = now(), updated_at = now() WHERE id = $1",
    [id, status, Math.max(0, Math.min(100, Math.round(progress)))],
  );
}

export async function completeJob(id: string) {
  await query("UPDATE jobs SET status = 'completed', progress = 100, updated_at = now() WHERE id = $1", [id]);
}

/** Marks failed, or re-queues with exponential backoff if the failure is recoverable. */
export async function failJob(job: JobRow, message: string, recoverable: boolean): Promise<boolean> {
  const row = await queryOne<{ retry_count: number; max_retries: number }>(
    "SELECT retry_count, max_retries FROM jobs WHERE id = $1",
    [job.id],
  );
  if (recoverable && row && row.retry_count < row.max_retries) {
    const delay = 15 * 2 ** row.retry_count;
    await query(
      `UPDATE jobs SET status = 'queued', retry_count = retry_count + 1, progress = 0,
         run_at = now() + ($2 || ' seconds')::interval, error_message = $3, updated_at = now() WHERE id = $1`,
      [job.id, String(delay), message],
    );
    return true;
  }
  await query("UPDATE jobs SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1", [
    job.id,
    message,
  ]);
  return false;
}

/** Re-queues jobs whose worker died (no heartbeat for 3 minutes). */
export async function recoverStaleJobs() {
  await query(
    `UPDATE jobs SET status = 'queued', retry_count = retry_count + 1, progress = 0, updated_at = now()
     WHERE status IN ('fetching_source','transcribing','analyzing','rendering')
       AND heartbeat_at < now() - interval '3 minutes' AND retry_count < max_retries`,
  );
  await query(
    `UPDATE jobs SET status = 'failed', error_message = 'The worker stopped unexpectedly.', updated_at = now()
     WHERE status IN ('fetching_source','transcribing','analyzing','rendering')
       AND heartbeat_at < now() - interval '3 minutes'`,
  );
}
