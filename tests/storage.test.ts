import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkStorage, putFile, putStream, removeKey, removeProjectFiles, storageSize, streamFile, withLocalFile, writeText } from "@/lib/storage";

const saved = { ...process.env };
const payload = crypto.randomBytes(300_000);

function suite(driver: "disk" | "s3") {
  const projectId = crypto.randomUUID();
  const key = `projects/${projectId}/source.mp4`;
  let tmp = "";

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-storage-"));
    process.env.STORAGE_DRIVER = driver;
    if (driver === "disk") process.env.STORAGE_DIR = path.join(tmp, "store");
    else {
      process.env.S3_BUCKET = process.env.S3_TEST_BUCKET;
      process.env.S3_PREFIX = `clipforge-tests/${crypto.randomUUID()}`;
    }
  });

  afterAll(async () => {
    await removeProjectFiles(projectId).catch(() => undefined);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it("is ready", async () => {
    await expect(checkStorage()).resolves.toBeUndefined();
  });

  it("stores streams and reports the size", async () => {
    expect(await storageSize(key)).toBeNull();
    await putStream(key, Readable.from([payload]), "video/mp4");
    expect(await storageSize(key)).toBe(payload.length);
  });

  it("gives FFmpeg-style local access to the exact bytes", async () => {
    await withLocalFile(key, async (file) => {
      expect(fs.readFileSync(file).equals(payload)).toBe(true);
    });
  });

  it("serves full and ranged responses", async () => {
    const full = await streamFile(key, new Request("http://x/"), "video/mp4");
    expect(full.status).toBe(200);
    expect(Buffer.from(await full.arrayBuffer()).equals(payload)).toBe(true);

    const part = await streamFile(key, new Request("http://x/", { headers: { range: "bytes=100-199" } }), "video/mp4");
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 100-199/${payload.length}`);
    expect(Buffer.from(await part.arrayBuffer()).equals(payload.subarray(100, 200))).toBe(true);

    const tail = await streamFile(key, new Request("http://x/", { headers: { range: "bytes=-50" } }), "video/mp4");
    expect(Buffer.from(await tail.arrayBuffer()).equals(payload.subarray(payload.length - 50))).toBe(true);
  });

  it("answers 404 for missing objects and 416 for unsatisfiable ranges", async () => {
    const missing = await streamFile(`projects/${projectId}/nope.mp4`, new Request("http://x/"), "video/mp4");
    expect(missing.status).toBe(404);
    const bad = await streamFile(key, new Request("http://x/", { headers: { range: `bytes=${payload.length + 10}-` } }), "video/mp4");
    expect(bad.status).toBe(416);
  });

  it("uploads local files and text, and removes everything for a project", async () => {
    const local = path.join(tmp, "clip.mp4");
    fs.writeFileSync(local, payload);
    await putFile(`projects/${projectId}/clips/a.mp4`, local);
    await writeText(`projects/${projectId}/clips/a.srt`, "1\n00:00:00,000 --> 00:00:01,000\nHi\n");
    expect(await storageSize(`projects/${projectId}/clips/a.srt`)).toBeGreaterThan(10);

    await removeKey(`projects/${projectId}/clips/a.srt`);
    expect(await storageSize(`projects/${projectId}/clips/a.srt`)).toBeNull();

    await removeProjectFiles(projectId);
    expect(await storageSize(key)).toBeNull();
    expect(await storageSize(`projects/${projectId}/clips/a.mp4`)).toBeNull();
  });

  it("rejects keys that could escape the storage root", async () => {
    await expect(storageSize("../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(putStream("projects//x", Readable.from([Buffer.from("x")]))).rejects.toThrow(/Invalid storage key/);
  });
}

describe("disk storage", () => suite("disk"));

// Runs against a real bucket when S3_TEST_BUCKET (plus the usual S3_* / AWS credentials) is configured.
describe.skipIf(!process.env.S3_TEST_BUCKET)("S3 storage", () => suite("s3"));
