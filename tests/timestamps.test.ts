import { describe, expect, it } from "vitest";
import { formatTimestamp, normalizeRange, validateClips, type RawClip } from "@/lib/timestamps";

const clip = (s: number, e: number, score = 50): RawClip => ({
  title: "t",
  startSeconds: s,
  endSeconds: e,
  hook: "h",
  summary: "s",
  transcript: "x",
  engagementScore: score,
  reason: "r",
});

describe("normalizeRange", () => {
  it("never exceeds 60 seconds", () => {
    const r = normalizeRange(10, 200, 500)!;
    expect(r.end - r.start).toBeLessThanOrEqual(60);
  });
  it("respects a lower user maximum", () => {
    const r = normalizeRange(0, 100, 500, 30)!;
    expect(r.end).toBe(30);
  });
  it("clamps to the source duration", () => {
    expect(normalizeRange(90, 130, 100)).toEqual({ start: 90, end: 100 });
  });
  it("rejects inverted, tiny, and non-finite ranges", () => {
    expect(normalizeRange(50, 40, 100)).toBeNull();
    expect(normalizeRange(50, 52, 100)).toBeNull();
    expect(normalizeRange(NaN, 52, 100)).toBeNull();
    expect(normalizeRange(500, 560, 100)).toBeNull();
  });
});

describe("validateClips", () => {
  it("drops invalid and overlapping clips, sorts by score, caps duration", () => {
    const out = validateClips([clip(0, 300, 40), clip(10, 40, 90), clip(15, 45, 80), clip(-5, -1), clip(100, 130, 70)], 200);
    expect(out.every((c) => c.durationSeconds <= 60 && c.endSeconds > c.startSeconds)).toBe(true);
    expect(out.map((c) => c.engagementScore)).toEqual([90, 70]);
  });
  it("clamps scores to 0-100", () => {
    expect(validateClips([clip(0, 30, 250)], 100)[0].engagementScore).toBe(100);
  });
});

describe("formatTimestamp", () => {
  it("formats", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});
