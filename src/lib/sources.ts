import { Readable } from "node:stream";
import { env } from "./env";
import { PipelineError } from "./ai";
import { assertSafeUrl, UnsafeUrlError } from "./net-guard";
import { freeBytes, putStream, storageSize } from "./storage";
import type { ProjectRow } from "./repo";

/**
 * Source adapters resolve a project to a video file in storage. Only media the user uploaded
 * or an explicitly provided, publicly reachable direct file URL is supported. YouTube pages are
 * never scraped or downloaded: YouTube URLs provide metadata only.
 */
export interface SourceAdapter {
  id: string;
  supports(p: Pick<ProjectRow, "source_storage_key" | "direct_url">): boolean;
  /** Ensures the video exists in storage and returns its storage key. */
  resolve(p: ProjectRow, onProgress: (f: number) => void): Promise<string>;
}

export const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-m4v": "m4v",
  "video/mpeg": "mpg",
};

const uploadAdapter: SourceAdapter = {
  id: "upload",
  supports: (p) => !!p.source_storage_key,
  async resolve(p) {
    if (!p.source_storage_key || (await storageSize(p.source_storage_key)) === null) {
      throw new PipelineError("The uploaded video is no longer available. Please upload it again.");
    }
    return p.source_storage_key;
  },
};

async function fetchWithSafeRedirects(rawUrl: string): Promise<Response> {
  let url = rawUrl;
  for (let i = 0; i < 4; i++) {
    const safe = await assertSafeUrl(url);
    const res = await fetch(safe, { redirect: "manual", signal: AbortSignal.timeout(60_000) }).catch(() => {
      throw new PipelineError("The video URL could not be reached.", true);
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new PipelineError("The video URL redirected without a destination.");
      url = new URL(loc, safe).toString();
      continue;
    }
    return res;
  }
  throw new PipelineError("The video URL redirected too many times.");
}

const directUrlAdapter: SourceAdapter = {
  id: "direct-url",
  supports: (p) => !!p.direct_url,
  async resolve(p, onProgress) {
    try {
      const res = await fetchWithSafeRedirects(p.direct_url!);
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
        throw new PipelineError("The video URL is not accessible (private, expired, or deleted).");
      }
      if (!res.ok || !res.body) throw new PipelineError(`The video URL returned an error (HTTP ${res.status}).`, res.status >= 500);
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const ext = EXT_BY_TYPE[type];
      if (!ext && type !== "application/octet-stream") throw new PipelineError("The URL does not point to a supported video file.");
      const total = parseInt(res.headers.get("content-length") ?? "0", 10);
      if (total > env.maxUploadBytes) throw new PipelineError("The video file exceeds the maximum allowed size.");
      const free = await freeBytes();
      if (free !== null && total > 0 && free < total * 2) throw new PipelineError("There is not enough storage space for this video.", true);

      const key = `projects/${p.id}/source.${ext ?? "mp4"}`;
      let received = 0;
      let tooLarge = false;
      const source = Readable.fromWeb(res.body as never);
      source.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > env.maxUploadBytes) {
          tooLarge = true;
          source.destroy(new Error("too large"));
        }
        if (total > 0) onProgress(received / total);
      });
      try {
        await putStream(key, source, type === "application/octet-stream" ? undefined : type);
      } catch {
        if (tooLarge) throw new PipelineError("The video file exceeds the maximum allowed size.");
        throw new PipelineError("The download was interrupted.", true);
      }
      return key;
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new PipelineError(`The video URL was rejected: ${e.message}`);
      throw e;
    }
  },
};

export const SOURCE_ADAPTERS: SourceAdapter[] = [uploadAdapter, directUrlAdapter];

export async function resolveSource(p: ProjectRow, onProgress: (f: number) => void): Promise<string> {
  const adapter = SOURCE_ADAPTERS.find((a) => a.supports(p));
  if (!adapter) {
    throw new PipelineError("No permitted video source is available. Upload the video or provide a direct file URL.");
  }
  return adapter.resolve(p, onProgress);
}
