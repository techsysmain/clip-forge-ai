import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTranscript, PipelineError, snapClips } from "@/lib/ai";
import type { Transcript } from "@/lib/subtitles";

const segments = [
  { text: "Intro words here.", start: 0, end: 8 },
  { text: "Here is the key lesson about focus.", start: 8, end: 20 },
  { text: "And the payoff is huge.", start: 20, end: 40 },
  { text: "Unrelated outro.", start: 40, end: 50 },
];
const transcript: Transcript = { text: segments.map((s) => s.text).join(" "), words: [], segments };

function mockAi(clips: object[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ videoSummary: "A talk.", clips }) } }] }), { status: 200 }),
    ),
  );
}
const base = { title: "T", hook: "h", summary: "s", transcript: "x", reason: "r", captionPreset: "clean", aspectRatio: "9:16" };

describe("analyzeTranscript", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("validates AI timestamps, snaps to segments and uses the verbatim transcript", async () => {
    mockAi([
      { ...base, startSeconds: 8.7, endSeconds: 39.2, engagementScore: 91 },
      { ...base, startSeconds: 500, endSeconds: 560, engagementScore: 99 }, // beyond source duration
    ]);
    const r = await analyzeTranscript("Title", transcript, 50, 60);
    expect(r.clips).toHaveLength(1);
    expect(r.clips[0].startSeconds).toBe(8);
    expect(r.clips[0].endSeconds).toBe(40);
    expect(r.clips[0].transcript).toContain("key lesson");
    expect(r.clips[0].durationSeconds).toBeLessThanOrEqual(60);
  });

  it("never returns clips longer than the maximum", async () => {
    mockAi([{ ...base, startSeconds: 0, endSeconds: 50, engagementScore: 80 }]);
    const r = await analyzeTranscript("Title", transcript, 50, 30);
    expect(r.clips[0].endSeconds - r.clips[0].startSeconds).toBeLessThanOrEqual(30);
  });

  it("fails clearly when nothing valid is returned", async () => {
    mockAi([{ ...base, startSeconds: 30, endSeconds: 20, engagementScore: 80 }]);
    await expect(analyzeTranscript("Title", transcript, 50, 60)).rejects.toBeInstanceOf(PipelineError);
  });

  it("treats rate limits as recoverable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(analyzeTranscript("Title", transcript, 50, 60)).rejects.toMatchObject({ recoverable: true });
  });
});

describe("Gemini provider", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = "g-test";
    process.env.AI_PROVIDER = "gemini";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_PROVIDER;
  });

  it("analyzes via generateContent with structured JSON", async () => {
    const payload = { videoSummary: "A talk.", clips: [{ ...base, startSeconds: 8, endSeconds: 40, engagementScore: 88 }] };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await analyzeTranscript("Title", transcript, 50, 60);
    expect(r.clips).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe("application/json");
  });

  it("reports a missing key clearly", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeTranscript("Title", transcript, 50, 60)).rejects.toBeInstanceOf(PipelineError);
  });
});

describe("snapClips", () => {
  it("snaps within the maximum length", () => {
    const [c] = snapClips([{ ...base, startSeconds: 7, endSeconds: 45, engagementScore: 1 }], segments, 30);
    expect(c.endSeconds - c.startSeconds).toBeLessThanOrEqual(30);
  });
});
