import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { closePool } from "../src/lib/db";

/** Applies pending SQL files from db/migrations in order. Safe to run repeatedly. */
export async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  const conn = await mysql.createConnection({ uri: url, multipleStatements: true, charset: "utf8mb4" });
  try {
    await conn.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB",
    );
    // Serialize concurrent migrators (web + worker starting together)
    const [lock] = await conn.query<mysql.RowDataPacket[]>("SELECT GET_LOCK('clipforge_migrate', 60) AS ok");
    if (!lock[0]?.ok) throw new Error("Could not acquire the migration lock.");
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const [done] = await conn.query<mysql.RowDataPacket[]>("SELECT 1 FROM schema_migrations WHERE name = ?", [f]);
      if (done.length) continue;
      await conn.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
      console.log(`applied ${f}`);
    }
    await conn.query("SELECT RELEASE_LOCK('clipforge_migrate')");
  } finally {
    await conn.end();
  }
}

if (process.argv[1]?.includes("migrate")) {
  migrate()
    .then(() => closePool())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
