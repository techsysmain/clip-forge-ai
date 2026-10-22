import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fetchYouTubeMetadata, MetadataError } from "@/lib/metadata";
import { parseYouTubeUrl } from "@/lib/youtube";

export const GET = handle(async (req: Request) => {
  await requireUser();
  const id = parseYouTubeUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!id) throw new ApiError(400, "That doesn't look like a valid YouTube video URL.");
  try {
    return NextResponse.json({ metadata: await fetchYouTubeMetadata(id) });
  } catch (e) {
    if (e instanceof MetadataError) throw new ApiError(e.status, e.message);
    throw e;
  }
});
