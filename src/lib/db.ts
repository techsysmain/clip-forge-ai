import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";

const g = globalThis as unknown as { __pgPool?: Pool };

function pool(): Pool {
  if (!g.__pgPool) {
    if (!env.databaseUrl) throw new DbUnavailableError("DATABASE_URL is not configured.");
    g.__pgPool = new Pool({ connectionString: env.databaseUrl, max: 10 });
    g.__pgPool.on("error", (e) => console.error("pg pool error", e.message));
  }
  return g.__pgPool;
}

export class DbUnavailableError extends Error {}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

export async function closePool() {
  await g.__pgPool?.end();
  g.__pgPool = undefined;
}

export const rawPool = pool;
