export const HARD_MAX_CLIP_SECONDS = 60;
export const MIN_CLIP_SECONDS = 5;

export interface RawClip {
  title: string;
  startSeconds: number;
  endSeconds: number;
  hook: string;
  summary: string;
  transcript: string;
  engagementScore: number;
  reason: string;
}

export interface ValidClip extends RawClip {
  durationSeconds: number;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Validates or repairs a time range against the source duration and max clip length.
 * Returns null if it cannot be made valid.
 */
export function normalizeRange(
  start: number,
  end: number,
  sourceDuration: number,
  maxClipSeconds = HARD_MAX_CLIP_SECONDS,
): { start: number; end: number } | null {
  if (![start, end, sourceDuration].every(Number.isFinite)) return null;
  const max = Math.min(maxClipSeconds, HARD_MAX_CLIP_SECONDS);
  let s = Math.max(0, start);
  let e = Math.min(end, sourceDuration);
  if (e <= s) return null;
  if (e - s > max) e = s + max;
  if (e - s < MIN_CLIP_SECONDS) return null;
  return { start: round3(s), end: round3(e) };
}

export function overlapRatio(a: [number, number], b: [number, number]): number {
  const inter = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  const shorter = Math.min(a[1] - a[0], b[1] - b[0]);
  return shorter > 0 ? inter / shorter : 0;
}

/** Validates AI output: clamps ranges, drops invalid or heavily overlapping clips, sorts by score. */
export function validateClips<T extends RawClip>(
  clips: T[],
  sourceDuration: number,
  maxClipSeconds = HARD_MAX_CLIP_SECONDS,
): (T & { durationSeconds: number })[] {
  const out: (T & { durationSeconds: number })[] = [];
  for (const c of [...clips].sort((a, b) => b.engagementScore - a.engagementScore)) {
    const range = normalizeRange(c.startSeconds, c.endSeconds, sourceDuration, maxClipSeconds);
    if (!range) continue;
    if (out.some((o) => overlapRatio([o.startSeconds, o.endSeconds], [range.start, range.end]) > 0.5)) continue;
    out.push({
      ...c,
      title: c.title.trim().slice(0, 120),
      hook: c.hook.trim().slice(0, 300),
      summary: c.summary.trim().slice(0, 600),
      reason: c.reason.trim().slice(0, 600),
      engagementScore: Math.max(0, Math.min(100, Math.round(c.engagementScore))),
      startSeconds: range.start,
      endSeconds: range.end,
      durationSeconds: round3(range.end - range.start),
    });
  }
  return out.sort((a, b) => b.engagementScore - a.engagementScore);
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
