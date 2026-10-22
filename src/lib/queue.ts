import { exec, isDuplicateError, newId, queryOne, withTransaction } from "./db";
import type { JobRow } from "./repo";

/**
 * MySQL-backed job queue (FOR UPDATE SKIP LOCKED). A unique index on the generated `active_key`
 * column guarantees at most one active job per (type, target), which makes submissions idempotent.
 */
export async function enqueueJob(
  jobType: "analyze" | "render",
  projectId: string,
  clipId: string | null = null,
): Promise<{ job: JobRow; created: boolean }> {
  const id = newId();
  try {
    await exec("INSERT INTO jobs (id, project_id, clip_id, job_type) VALUES (?, ?, ?, ?)", [id, projectId, clipId, jobType]);
    const job = await queryOne<JobRow>("SELECT * FROM jobs WHERE id = ?", [id]);
    return { job: job!, created: true };
  } catch (e) {
    if (!isDuplicateError(e)) throw e;
    const existing = await queryOne<JobRow>(
      `SELECT * FROM jobs WHERE job_type = ? AND project_id = ? AND clip_id <=> ?
       AND status NOT IN ('completed','failed') ORDER BY created_at DESC LIMIT 1`,
      [jobType, projectId, clipId],
    );
    if (!existing) throw e;
    return { job: existing, created: false };
  }
}

export async function claimJob(): Promise<JobRow | null> {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      "SELECT id FROM jobs WHERE status = 'queued' AND run_at <= NOW(3) ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED",
    );
    const id = (rows as { id: string }[])[0]?.id;
    if (!id) return null;
    await conn.query(
      `UPDATE jobs SET status = IF(job_type = 'analyze', 'fetching_source', 'rendering'),
         heartbeat_at = NOW(3), progress = 0 WHERE id = ?`,
      [id],
    );
    const [claimed] = await conn.query("SELECT * FROM jobs WHERE id = ?", [id]);
    return (claimed as JobRow[])[0] ?? null;
  });
}

export async function updateJob(id: string, status: string, progress: number) {
  await exec("UPDATE jobs SET status = ?, progress = ?, heartbeat_at = NOW(3) WHERE id = ?", [
    status,
    Math.max(0, Math.min(100, Math.round(progress))),
    id,
  ]);
}

export async function completeJob(id: string) {
  await exec("UPDATE jobs SET status = 'completed', progress = 100 WHERE id = ?", [id]);
}

/** Marks failed, or re-queues with exponential backoff if the failure is recoverable. */
export async function failJob(job: JobRow, message: string, recoverable: boolean): Promise<boolean> {
  const row = await queryOne<{ retry_count: number; max_retries: number }>(
    "SELECT retry_count, max_retries FROM jobs WHERE id = ?",
    [job.id],
  );
  if (recoverable && row && row.retry_count < row.max_retries) {
    const delay = 15 * 2 ** row.retry_count;
    await exec(
      `UPDATE jobs SET status = 'queued', retry_count = retry_count + 1, progress = 0,
         run_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), error_message = ? WHERE id = ?`,
      [delay, message, job.id],
    );
    return true;
  }
  await exec("UPDATE jobs SET status = 'failed', error_message = ? WHERE id = ?", [message, job.id]);
  return false;
}

/** Re-queues jobs whose worker died (no heartbeat for 3 minutes). */
export async function recoverStaleJobs() {
  const active = "status IN ('fetching_source','transcribing','analyzing','rendering') AND heartbeat_at < DATE_SUB(NOW(3), INTERVAL 3 MINUTE)";
  await exec(`UPDATE jobs SET status = 'queued', retry_count = retry_count + 1, progress = 0 WHERE ${active} AND retry_count < max_retries`);
  await exec(`UPDATE jobs SET status = 'failed', error_message = 'The worker stopped unexpectedly.' WHERE ${active}`);
  // Reflect permanently failed jobs on their project / clip so the UI never stays "in progress".
  await exec(
    `UPDATE projects p JOIN jobs j ON j.project_id = p.id AND j.job_type = 'analyze' AND j.status = 'failed'
     SET p.status = 'failed', p.error_message = COALESCE(j.error_message, 'Processing failed.')
     WHERE p.status IN ('queued','fetching_source','transcribing','analyzing')
       AND NOT EXISTS (SELECT 1 FROM jobs a WHERE a.project_id = p.id AND a.job_type = 'analyze' AND a.status NOT IN ('completed','failed'))`,
  );
  await exec(
    `UPDATE clips c JOIN jobs j ON j.clip_id = c.id AND j.job_type = 'render' AND j.status = 'failed'
     SET c.status = 'failed', c.error_message = COALESCE(j.error_message, 'Rendering failed.')
     WHERE c.status IN ('queued','rendering')
       AND NOT EXISTS (SELECT 1 FROM jobs a WHERE a.clip_id = c.id AND a.job_type = 'render' AND a.status NOT IN ('completed','failed'))`,
  );
}
