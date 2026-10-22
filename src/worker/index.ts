import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "../../scripts/migrate";
import { closePool, query } from "../lib/db";
import { env } from "../lib/env";
import { claimJob, recoverStaleJobs } from "../lib/queue";
import { removeProjectFiles } from "../lib/storage";
import { runJob } from "./processors";

let stopping = false;
let active = 0;

async function cleanupTmp() {
  const dir = os.tmpdir();
  for (const name of await fs.promises.readdir(dir).catch(() => [] as string[])) {
    if (!name.startsWith("clipforge-")) continue;
    const p = path.join(dir, name);
    const st = await fs.promises.stat(p).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 60 * 60 * 1000) await fs.promises.rm(p, { recursive: true, force: true });
  }
}

/** Data retention: removes projects (and their files) older than RETENTION_DAYS. */
async function enforceRetention() {
  const rows = await query<{ id: string }>(
    "DELETE FROM projects WHERE created_at < now() - ($1 || ' days')::interval RETURNING id",
    [String(env.retentionDays)],
  );
  for (const r of rows) await removeProjectFiles(r.id);
  if (rows.length) console.log(`[worker] retention removed ${rows.length} project(s)`);
}

async function main() {
  await migrate();
  await cleanupTmp();
  console.log(`[worker] started (concurrency ${env.workerConcurrency})`);
  await recoverStaleJobs();
  await enforceRetention();
  setInterval(() => void recoverStaleJobs().catch((e) => console.error(e.message)), 60_000);
  setInterval(() => {
    void enforceRetention().catch((e) => console.error(e.message));
    void cleanupTmp();
  }, 60 * 60_000);

  const shutdown = () => {
    stopping = true;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (!stopping) {
    if (active < env.workerConcurrency) {
      const job = await claimJob().catch((e) => {
        console.error("[worker] claim failed:", e.message);
        return null;
      });
      if (job) {
        active++;
        console.log(`[worker] running ${job.job_type} job ${job.id}`);
        void runJob(job).finally(() => active--);
        continue;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  while (active > 0) await new Promise((r) => setTimeout(r, 500));
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
