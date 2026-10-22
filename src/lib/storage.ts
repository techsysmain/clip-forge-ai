import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "./env";

/**
 * Object storage with two drivers selected by STORAGE_DRIVER:
 *  - "disk" (default): a directory shared by the web app and the worker (a volume in Docker).
 *  - "s3": any S3-compatible bucket, so web and worker need no shared filesystem.
 * Keys are validated so they can never escape the storage root or prefix.
 */
const useS3 = () => env.storageDriver === "s3";

export function assertKey(key: string): string {
  if (!/^[A-Za-z0-9._\-/]+$/.test(key) || key.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  mpg: "video/mpeg",
  srt: "application/x-subrip",
};

function contentTypeFor(key: string): string {
  return CONTENT_TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------------------------
// Disk helpers
// ---------------------------------------------------------------------------------------------

function root() {
  return path.resolve(env.storageDir);
}

function diskPath(key: string): string {
  assertKey(key);
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return full;
}

async function diskParent(key: string): Promise<string> {
  const p = diskPath(key);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  return p;
}

// ---------------------------------------------------------------------------------------------
// S3 helpers
// ---------------------------------------------------------------------------------------------

let client: S3Client | null = null;

function s3(): S3Client {
  if (!env.s3Bucket) throw new Error("S3_BUCKET is not configured");
  client ??= new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    ...(env.s3AccessKeyId && env.s3SecretAccessKey
      ? { credentials: { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey } }
      : {}),
  });
  return client;
}

function objectKey(key: string): string {
  assertKey(key);
  return env.s3Prefix ? `${env.s3Prefix}/${key}` : key;
}

function errorName(e: unknown): string {
  return (e as { name?: string })?.name ?? "";
}

const isMissing = (e: unknown) => ["NoSuchKey", "NotFound"].includes(errorName(e)) || (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export async function storageSize(key: string): Promise<number | null> {
  if (useS3()) {
    try {
      const r = await s3().send(new HeadObjectCommand({ Bucket: env.s3Bucket, Key: objectKey(key) }));
      return r.ContentLength ?? 0;
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }
  const p = diskPath(key);
  try {
    return (await fs.promises.stat(p)).size;
  } catch {
    return null;
  }
}

export async function removeKey(key: string | null | undefined) {
  if (!key) return;
  if (useS3()) {
    await s3().send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: objectKey(key) }));
    return;
  }
  await fs.promises.rm(diskPath(key), { force: true });
}

export async function removeProjectFiles(projectId: string) {
  if (!/^[A-Za-z0-9-]+$/.test(projectId)) throw new Error("Invalid project id");
  if (!useS3()) {
    await fs.promises.rm(path.join(root(), "projects", projectId), { recursive: true, force: true });
    return;
  }
  const prefix = objectKey(`projects/${projectId}/x`).replace(/x$/, "");
  let token: string | undefined;
  do {
    const page = await s3().send(new ListObjectsV2Command({ Bucket: env.s3Bucket, Prefix: prefix, ContinuationToken: token }));
    const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (objects.length) {
      await s3().send(new DeleteObjectsCommand({ Bucket: env.s3Bucket, Delete: { Objects: objects, Quiet: true } }));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/** Stores a readable stream under `key`. Partial writes never become visible. */
export async function putStream(key: string, body: Readable, contentType = contentTypeFor(key)): Promise<void> {
  if (useS3()) {
    const upload = new Upload({
      client: s3(),
      params: { Bucket: env.s3Bucket, Key: objectKey(key), Body: body, ContentType: contentType },
      queueSize: 4,
      partSize: 16 * 1024 * 1024,
      leavePartsOnError: false,
    });
    try {
      await upload.done();
    } catch (e) {
      await upload.abort().catch(() => undefined);
      throw e;
    }
    return;
  }
  const target = await diskParent(key);
  const tmp = `${target}.partial`;
  try {
    await pipeline(body, fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, target);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw e;
  }
}

/** Stores a local file under `key`. */
export async function putFile(key: string, localPath: string, contentType = contentTypeFor(key)): Promise<void> {
  await putStream(key, fs.createReadStream(localPath), contentType);
}

export async function writeText(key: string, content: string) {
  await putStream(key, Readable.from([Buffer.from(content, "utf8")]), key.endsWith(".srt") ? "application/x-subrip; charset=utf-8" : "text/plain; charset=utf-8");
}

/**
 * Runs `fn` with a local filesystem path to the object (needed by FFmpeg). With the disk driver this is
 * the stored file itself (no copy); with S3 the object is downloaded to a temporary directory that is
 * removed afterwards. `fn` must treat the file as read-only.
 */
export async function withLocalFile<T>(key: string, fn: (file: string) => Promise<T>): Promise<T> {
  if (!useS3()) return fn(diskPath(key));
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "clipforge-src-"));
  try {
    const file = path.join(dir, path.basename(key));
    const res = await s3().send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: objectKey(key) }));
    if (!res.Body) throw new Error("Empty S3 object body");
    await pipeline(res.Body as Readable, fs.createWriteStream(file));
    return await fn(file);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

/** Free bytes on the shared disk, or null when unknown / not applicable (S3). */
export async function freeBytes(): Promise<number | null> {
  if (useS3()) return null;
  try {
    await fs.promises.mkdir(root(), { recursive: true });
    const s = await fs.promises.statfs(root());
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

/** Readiness check: the backend must be reachable and writable/readable. Throws when it is not. */
export async function checkStorage(): Promise<void> {
  if (useS3()) {
    await s3().send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
    return;
  }
  await fs.promises.mkdir(root(), { recursive: true });
  await fs.promises.access(root(), fs.constants.R_OK | fs.constants.W_OK);
}

const RANGE = /^bytes=(\d*)-(\d*)$/;

/** Streams a stored object with HTTP Range support. */
export async function streamFile(key: string, req: Request, contentType: string, disposition?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (disposition) headers["Content-Disposition"] = disposition;
  const rangeHeader = req.headers.get("range") ?? "";
  const range = RANGE.exec(rangeHeader);
  const hasRange = !!range && !!(range[1] || range[2]);
  const notFound = () => new Response(JSON.stringify({ error: "File not found." }), { status: 404 });

  if (useS3()) {
    try {
      const res = await s3().send(
        new GetObjectCommand({ Bucket: env.s3Bucket, Key: objectKey(key), Range: hasRange ? rangeHeader : undefined }),
        { abortSignal: req.signal },
      );
      if (!res.Body) return notFound();
      if (res.ContentLength !== undefined) headers["Content-Length"] = String(res.ContentLength);
      if (res.ContentRange) headers["Content-Range"] = res.ContentRange;
      const body = (res.Body as { transformToWebStream(): ReadableStream }).transformToWebStream();
      return new Response(body, { status: res.ContentRange ? 206 : 200, headers });
    } catch (e) {
      if (isMissing(e)) return notFound();
      if (errorName(e) === "InvalidRange") return new Response(null, { status: 416 });
      throw e;
    }
  }

  const p = diskPath(key);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(p);
  } catch {
    return notFound();
  }
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && hasRange) {
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
