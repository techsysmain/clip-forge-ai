import { randomUUID } from "node:crypto";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { env } from "./env";

const g = globalThis as unknown as { __mysqlPool?: Pool };

export class DbUnavailableError extends Error {}

export function newId(): string {
  return randomUUID();
}

export function rawPool(): Pool {
  if (!g.__mysqlPool) {
    if (!env.databaseUrl) throw new DbUnavailableError("DATABASE_URL is not configured.");
    const pool = mysql.createPool({
      uri: env.databaseUrl,
      connectionLimit: 10,
      timezone: "Z",
      charset: "utf8mb4",
      dateStrings: false,
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
    // Keep every session in UTC so NOW() and JS dates agree.
    pool.pool.on("connection", (c) => c.query("SET time_zone = '+00:00'"));
    g.__mysqlPool = pool;
  }
  return g.__mysqlPool;
}

/** SELECT helper. Use `?` placeholders; arrays expand for `IN (?)`. */
export async function query<T = RowDataPacket>(text: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await rawPool().query(text, params);
  return rows as T[];
}

export async function queryOne<T = RowDataPacket>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** INSERT/UPDATE/DELETE helper. Returns the number of affected rows. */
export async function exec(text: string, params: unknown[] = []): Promise<number> {
  const [res] = await rawPool().query<ResultSetHeader>(text, params);
  return res.affectedRows;
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await rawPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback().catch(() => undefined);
    throw e;
  } finally {
    conn.release();
  }
}

export function isDuplicateError(e: unknown): boolean {
  return (e as { code?: string })?.code === "ER_DUP_ENTRY";
}

export async function closePool() {
  await g.__mysqlPool?.end();
  g.__mysqlPool = undefined;
}
