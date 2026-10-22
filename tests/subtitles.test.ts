import { describe, expect, it } from "vitest";
import {
  CAPTION_PRESETS,
  buildCaptions,
  resolveStyle,
  srtTime,
  toAss,
  toSrt,
  type Transcript,
} from "@/lib/subtitles";

const text = "So here is the big idea. Most people wait too long to start, and that is the real mistake you can make.";
const words = text.split(" ").map((w, i) => ({ word: w, start: 10 + i * 0.4, end: 10 + i * 0.4 + 0.35 }));
const transcript: Transcript = {
  text,
  words,
  segments: [{ text, start: 10, end: 10 + words.length * 0.4 }],
};

describe("srtTime", () => {
  it("formats timestamps", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
    expect(srtTime(3661.5)).toBe("01:01:01,500");
  });
});

describe("buildCaptions (word timing)", () => {
  const caps = buildCaptions(transcript, 10, 30, { maxCharsPerLine: 20 });
  it("produces clip-relative, ordered, non-overlapping captions", () => {
    expect(caps.length).toBeGreaterThan(1);
    expect(caps[0].start).toBeCloseTo(0, 2);
    for (let i = 1; i < caps.length; i++) expect(caps[i].start).toBeGreaterThanOrEqual(caps[i - 1].end - 1e-6);
  });
  it("keeps each caption within two lines of text", () => {
    expect(caps.every((c) => c.text.length <= 40)).toBe(true);
  });
  it("excludes words outside the clip range", () => {
    const only = buildCaptions(transcript, 10, 12);
    expect(only.map((c) => c.text).join(" ")).not.toContain("mistake");
  });
});

describe("buildCaptions (segment fallback)", () => {
  it("falls back to segment timing without word data", () => {
    const caps = buildCaptions({ ...transcript, words: [] }, 10, 40, { maxCharsPerLine: 20 });
    expect(caps.length).toBeGreaterThan(1);
    expect(caps.every((c) => c.words.length === 0)).toBe(true);
    expect(caps.every((c) => c.end > c.start)).toBe(true);
  });
});

describe("toSrt / toAss", () => {
  const caps = buildCaptions(transcript, 10, 30, { maxCharsPerLine: 20 });
  it("generates numbered SRT blocks", () => {
    const srt = toSrt(caps);
    expect(srt.startsWith("1\n00:00:00,000 --> ")).toBe(true);
    expect(srt.split("\n\n").filter(Boolean).length).toBe(caps.length);
  });
  it("highlights the current word in ASS when enabled", () => {
    const ass = toAss(caps, resolveStyle({ preset: "social" }), 1080, 1920);
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("{\\c&H00E6FF&}");
  });
  it("emits one event per caption without word highlighting", () => {
    const ass = toAss(caps, resolveStyle({ preset: "clean" }), 1080, 1920);
    expect(ass.split("\n").filter((l) => l.startsWith("Dialogue:")).length).toBe(caps.length);
  });
});

describe("resolveStyle", () => {
  it("validates untrusted input", () => {
    const s = resolveStyle({ preset: "nope", fontSize: 9999, textColor: "red; rm -rf", position: "x" });
    expect(s.fontSize).toBe(140);
    expect(s.textColor).toBe(CAPTION_PRESETS.clean.textColor);
    expect(s.position).toBe("bottom");
  });
});
