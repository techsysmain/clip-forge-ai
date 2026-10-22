import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Filesystem-backed object storage. The web app and the worker must share this directory
 * (a volume in Docker). Keys are validated so they can never escape the storage root.
 */
function root() {
  return path.resolve(env.storageDir);
}

export function storagePath(key: string): string {
  if (!/^[A-Za-z0-9._\-/]+$/.test(key) || key.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new Error("Invalid storage key");
  }
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function ensureParent(key: string): Promise<string> {
  const p = storagePath(key);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  return p;
}

export async function storageSize(key: string): Promise<number | null> {
  try {
    return (await fs.promises.stat(storagePath(key))).size;
  } catch {
    return null;
  }
}

export async function removeKey(key: string | null | undefined) {
  if (!key) return;
  await fs.promises.rm(storagePath(key), { force: true });
}

export async function removeProjectFiles(projectId: string) {
  await fs.promises.rm(storagePath(`projects/${projectId}/x`).replace(/x$/, ""), { recursive: true, force: true });
}

export async function writeText(key: string, content: string) {
  await fs.promises.writeFile(await ensureParent(key), content, "utf8");
}

export async function freeBytes(): Promise<number | null> {
  try {
    await fs.promises.mkdir(root(), { recursive: true });
    const s = await fs.promises.statfs(root());
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

/** Streams a stored file with HTTP Range support. */
export async function streamFile(
  key: string,
  req: Request,
  contentType: string,
  disposition?: string,
): Promise<Response> {
  const p = storagePath(key);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(p);
  } catch {
    return new Response(JSON.stringify({ error: "File not found." }), { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (disposition) headers["Content-Disposition"] = disposition;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = parseInt(range[1], 10);
      if (range[2]) end = Math.min(end, parseInt(range[2], 10));
    } else {
      start = Math.max(0, stat.size - parseInt(range[2], 10));
    }
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  const stream = fs.createReadStream(p, { start, end });
  return new Response(stream as unknown as ReadableStream, { status, headers });
}
