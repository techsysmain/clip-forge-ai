import { env } from "./env";
import { parseIsoDuration } from "./youtube";

export interface VideoMetadata {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export class MetadataError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

/**
 * Retrieves public metadata through official endpoints only: the YouTube Data API (if a key
 * is configured) or the public oEmbed endpoint. No media is downloaded.
 */
export async function fetchYouTubeMetadata(videoId: string): Promise<VideoMetadata> {
  if (env.youtubeKey) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", env.youtubeKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (res?.status === 429 || res?.status === 403) {
      throw new MetadataError("The YouTube API quota was reached. Please try again later.", 429);
    }
    if (res?.ok) {
      const data = (await res.json()) as {
        items?: {
          snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> };
          contentDetails: { duration: string };
        }[];
      };
      const item = data.items?.[0];
      if (!item) throw new MetadataError("This video is private, deleted, or unavailable.");
      const t = item.snippet.thumbnails;
      return {
        videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnailUrl: (t.maxres ?? t.high ?? t.medium ?? t.default)?.url ?? null,
        durationSeconds: parseIsoDuration(item.contentDetails.duration) || null,
      };
    }
  }

  const oembed = new URL("https://www.youtube.com/oembed");
  oembed.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  oembed.searchParams.set("format", "json");
  const res = await fetch(oembed, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!res) throw new MetadataError("Could not reach YouTube to read video details.", 502);
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new MetadataError("This video is private, restricted, deleted, or unavailable.");
  }
  if (!res.ok) throw new MetadataError("Could not read video details from YouTube.", 502);
  const d = (await res.json()) as { title: string; author_name?: string; thumbnail_url?: string };
  return {
    videoId,
    title: d.title,
    channel: d.author_name ?? null,
    thumbnailUrl: d.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: null,
  };
}
