import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOwnedClip } from "@/lib/repo";
import { streamFile } from "@/lib/storage";

/**
 * Authorizes and streams a rendered clip. ?type=mp4|srt. Add ?inline=1 for in-page playback.
 * Ownership is verified against the session on every request, so IDs alone grant no access.
 */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { clip } = await getOwnedClip(user.id, (await params).id);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "srt" ? "srt" : "mp4";
  const key = type === "srt" ? clip.subtitle_storage_key : clip.output_storage_key;
  if (clip.status !== "rendered" || !key) throw new ApiError(409, "This clip has not been rendered yet.");
  const name = clip.title.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "clip";
  const inline = url.searchParams.get("inline") === "1";
  return streamFile(
    key,
    req,
    type === "srt" ? "application/x-subrip; charset=utf-8" : "video/mp4",
    `${inline ? "inline" : "attachment"}; filename="${name}.${type}"`,
  );
});
