import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { extractFrames } from "@/lib/ffmpeg";
import { analysisFrameCount, analyzeVideoFrames, sampleTimes } from "@/lib/vision";

describe("sampleTimes", () => {
  it("spreads samples evenly inside the range", () => {
    expect(sampleTimes(10, 20, 5)).toEqual([11, 13, 15, 17, 19]);
    expect(sampleTimes(0, 8, 1)).toEqual([4]);
  });

  it("scales the frame budget with duration within limits", () => {
    expect(analysisFrameCount(30)).toBe(3);
    expect(analysisFrameCount(100000)).toBe(env.maxAnalysisFrames);
  });
});

// Calls the real vision API with a real FFmpeg-generated video: needs OPENAI_API_KEY or GEMINI_API_KEY.
const live = !!(env.openaiKey || env.geminiKey) && spawnSync(env.ffmpegPath, ["-version"]).status === 0;

describe.skipIf(!live)("live frame analysis", () => {
  it("describes sampled frames with the configured provider", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-vision-"));
    try {
      const video = path.join(dir, "v.mp4");
      const r = spawnSync(
        env.ffmpegPath,
        ["-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=20", "-c:v", "libx264", "-pix_fmt", "yuv420p", video],
        { encoding: "utf8" },
      );
      expect(r.status).toBe(0);
      const frames = await extractFrames(video, [2, 10, 18], dir, 512);
      expect(frames).toHaveLength(3);
      const notes = await analyzeVideoFrames(video, 20, dir);
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.description.length).toBeGreaterThan(0);
        expect(n.visualInterest).toBeGreaterThanOrEqual(0);
        expect(n.visualInterest).toBeLessThanOrEqual(100);
        expect(n.faceCount).toBe(0); // a synthetic test pattern has no faces
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
