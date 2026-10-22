import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { getOwnedProject } from "@/lib/repo";
import { EXT_BY_TYPE } from "@/lib/sources";
import { ensureParent, freeBytes, removeKey } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const ACTIVE = ["queued", "fetching_source", "transcribing", "analyzing"];

/** Streams a raw video upload (Content-Type: video/*) straight to storage with size limits. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, (await params).id);
  if (ACTIVE.includes(project.status)) throw new ApiError(409, "This project is being processed. Try again when it finishes.");

  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type];
  if (!ext) throw new ApiError(415, "Unsupported file type. Upload an MP4, MOV, WebM, MKV, or M4V video.");
  const length = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (!length) throw new ApiError(411, "Missing file size.");
  if (length > env.maxUploadBytes) {
    throw new ApiError(413, `The file is too large. The limit is ${Math.round(env.maxUploadBytes / 1048576)} MB.`);
  }
  const free = await freeBytes();
  if (free !== null && free < length * 2) throw new ApiError(507, "There is not enough storage space for this upload.");
  if (!req.body) throw new ApiError(400, "Empty upload.");

  const key = `projects/${project.id}/source.${ext}`;
  const target = await ensureParent(key);
  const tmp = `${target}.upload`;
  let received = 0;
  const source = Readable.fromWeb(req.body as never);
  source.on("data", (c: Buffer) => {
    received += c.length;
    if (received > env.maxUploadBytes) source.destroy(new Error("too large"));
  });
  try {
    await pipeline(source, fs.createWriteStream(tmp));
  } catch {
    await fs.promises.rm(tmp, { force: true });
    throw new ApiError(400, "The upload was interrupted or too large.");
  }
  if (project.source_storage_key && project.source_storage_key !== key) await removeKey(project.source_storage_key);
  await fs.promises.rename(tmp, target);

  // A new source invalidates any previous transcript and unrendered suggestions.
  await query(
    `UPDATE projects SET source_storage_key = $2, transcript = NULL, status = 'awaiting_source',
       error_message = NULL, updated_at = now() WHERE id = $1`,
    [project.id, key],
  );
  return NextResponse.json({ ok: true });
});
