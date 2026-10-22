import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exec, newId, query, queryOne } from "@/lib/db";
import { fetchYouTubeMetadata, MetadataError, type VideoMetadata } from "@/lib/metadata";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/net-guard";
import { publicProject, type ProjectRow } from "@/lib/repo";
import { canonicalYouTubeUrl, parseYouTubeUrl } from "@/lib/youtube";

const schema = z.object({
  youtubeUrl: z.string().trim().max(300).optional(),
  directUrl: z.string().trim().max(2000).optional(),
  title: z.string().trim().max(150).optional(),
  rightsConfirmed: z.literal(true, { errorMap: () => ({ message: "Please confirm you have the rights to this video." }) }),
  settings: z
    .object({
      aspectRatio: z.enum(["auto", "9:16", "16:9", "1:1"]).default("9:16"),
      maxClipSeconds: z.number().int().min(10).max(60).default(60),
      captionPreset: z.enum(["auto", "clean", "social", "minimal", "accessible"]).default("auto"),
      cropMode: z.enum(["center", "blur", "face"]).default("center"),
    })
    .default({}),
});

export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await query<ProjectRow & { clip_count: string; rendered_count: string }>(
    `SELECT p.id, p.user_id, p.source_url, p.source_type, p.youtube_video_id, p.direct_url, p.title, p.channel,
       p.thumbnail_url, p.duration_seconds, p.status, p.source_storage_key, NULL AS transcript, p.video_summary,
       p.settings, p.error_message, p.created_at, p.updated_at,
       (SELECT count(*) FROM clips c WHERE c.project_id = p.id) AS clip_count,
       (SELECT count(*) FROM clips c WHERE c.project_id = p.id AND c.status = 'rendered') AS rendered_count
     FROM projects p WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 100`,
    [user.id],
  );
  return NextResponse.json({
    projects: rows.map((r) => ({
      ...publicProject(r),
      clipCount: Number(r.clip_count),
      renderedCount: Number(r.rendered_count),
    })),
  });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = schema.parse(await req.json().catch(() => ({})));

  let meta: VideoMetadata | null = null;
  let videoId: string | null = null;
  if (body.youtubeUrl) {
    videoId = parseYouTubeUrl(body.youtubeUrl);
    if (!videoId) throw new ApiError(400, "That doesn't look like a valid YouTube video URL.");
    try {
      meta = await fetchYouTubeMetadata(videoId);
    } catch (e) {
      if (e instanceof MetadataError) throw new ApiError(e.status, e.message);
      throw e;
    }
  }
  if (body.directUrl) {
    try {
      await assertSafeUrl(body.directUrl);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new ApiError(400, e.message);
      throw e;
    }
  }
  const sourceType = videoId ? "youtube" : body.directUrl ? "url" : "upload";
  const title = meta?.title ?? (body.title || (body.directUrl ? new URL(body.directUrl).pathname.split("/").pop() : "") || "Uploaded video");

  const id = newId();
  await exec(
    `INSERT INTO projects (id, user_id, source_url, source_type, youtube_video_id, direct_url, title, channel, thumbnail_url,
       duration_seconds, settings, rights_confirmed)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      id,
      user.id,
      videoId ? canonicalYouTubeUrl(videoId) : (body.directUrl ?? null),
      sourceType,
      videoId,
      body.directUrl ?? null,
      title.slice(0, 200),
      meta?.channel ?? null,
      meta?.thumbnailUrl ?? null,
      meta?.durationSeconds ?? null,
      JSON.stringify(body.settings),
    ],
  );
  const row = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = ?", [id]);
  return NextResponse.json({ project: publicProject(row!) }, { status: 201 });
});
