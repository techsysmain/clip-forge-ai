import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { extractAudio, extractFrames, probe, renderClip } from "@/lib/ffmpeg";
import { resolveStyle, toAss } from "@/lib/subtitles";

/**
 * These tests drive the real FFmpeg/ffprobe binaries (no mocks). They are skipped only when FFmpeg
 * with libass is not installed on the machine running the tests.
 */
function hasFfmpeg(): boolean {
  const r = spawnSync(env.ffmpegPath, ["-hide_banner", "-filters"], { encoding: "utf8" });
  return r.status === 0 && /\bass\b/.test(r.stdout) && spawnSync(env.ffprobePath, ["-version"]).status === 0;
}

const ready = hasFfmpeg();
let dir = "";
let sidebyside = "";
let withAudio = "";

function ffmpeg(args: string[]) {
  const r = spawnSync(env.ffmpegPath, ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

/** Average RGB of the frame at `t` seconds. */
function averageColor(file: string, t: number): [number, number, number] {
  const r = spawnSync(
    env.ffmpegPath,
    ["-hide_banner", "-nostdin", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { maxBuffer: 1024 },
  );
  if (r.status !== 0 || r.stdout.length < 3) throw new Error("could not decode frame");
  return [r.stdout[0], r.stdout[1], r.stdout[2]];
}

async function render(opts: Partial<Parameters<typeof renderClip>[0]> & { name: string; width: number; height: number }) {
  const work = fs.mkdtempSync(path.join(dir, "render-"));
  fs.writeFileSync(path.join(work, "subs.ass"), toAss([], resolveStyle({}), opts.width, opts.height));
  await renderClip({ input: sidebyside, start: 0, end: 4, cropMode: "center", workDir: work, ...opts });
  const out = path.join(dir, `${opts.name}.mp4`);
  fs.copyFileSync(path.join(work, "out.mp4"), out);
  return out;
}

beforeAll(() => {
  if (!ready) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-test-"));
  sidebyside = path.join(dir, "sidebyside.mp4");
  withAudio = path.join(dir, "audio.mp4");
  // Left half red, right half blue, with a tone: lets us verify exactly where the crop window is.
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=red:s=640x720:r=30:d=8",
    "-f", "lavfi", "-i", "color=c=blue:s=640x720:r=30:d=8",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
    "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]",
    "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", sidebyside,
  ]);
  ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", withAudio]);
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!ready)("real FFmpeg pipeline", () => {
  it("probes dimensions, duration and audio", async () => {
    const info = await probe(sidebyside);
    expect(info).toMatchObject({ width: 1280, height: 720, hasAudio: true });
    expect(info.duration).toBeGreaterThan(7.5);
  });

  it("rejects files that are not videos", async () => {
    const bogus = path.join(dir, "bogus.mp4");
    fs.writeFileSync(bogus, "not a video");
    await expect(probe(bogus)).rejects.toThrow(/not a valid video/);
  });

  it("extracts mono speech audio", async () => {
    const out = path.join(dir, "speech.mp3");
    await extractAudio(withAudio, out, 24);
    expect(fs.statSync(out).size).toBeGreaterThan(1000);
  });

  it("extracts JPEG frames at requested times", async () => {
    const frames = await extractFrames(withAudio, [1, 3, 5], dir, 320);
    expect(frames.map((f) => f.time)).toEqual([1, 3, 5]);
    for (const f of frames) expect(fs.readFileSync(f.file).subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  it("renders a 9:16 center crop with the exact size and duration", async () => {
    const out = await render({ name: "center", width: 1080, height: 1920, start: 1, end: 4 });
    const info = await probe(out);
    expect([info.width, info.height]).toEqual([1080, 1920]);
    expect(info.duration).toBeGreaterThan(2.8);
    expect(info.duration).toBeLessThan(3.3);
    expect(info.hasAudio).toBe(true);
  }, 120_000);

  it("renders a blur-fill 9:16 clip", async () => {
    const out = await render({ name: "blur", width: 1080, height: 1920, cropMode: "blur", start: 0, end: 2 });
    const info = await probe(out);
    expect([info.width, info.height]).toEqual([1080, 1920]);
  }, 120_000);

  it("pans the face-aware crop from the left subject to the right subject", async () => {
    const out = await render({
      name: "face",
      width: 1080,
      height: 1920,
      cropMode: "face",
      start: 0,
      end: 4,
      track: {
        srcWidth: 1280,
        srcHeight: 720,
        points: [
          { t: 0, cx: 0.1, cy: 0.5 },
          { t: 1, cx: 0.1, cy: 0.5 },
          { t: 3, cx: 0.9, cy: 0.5 },
          { t: 4, cx: 0.9, cy: 0.5 },
        ],
      },
    });
    const info = await probe(out);
    expect([info.width, info.height]).toEqual([1080, 1920]);
    const [r0, , b0] = averageColor(out, 0.2);
    const [r1, , b1] = averageColor(out, 3.6);
    expect(r0).toBeGreaterThan(b0 + 100); // starts on the red (left) half
    expect(b1).toBeGreaterThan(r1 + 100); // ends on the blue (right) half
  }, 180_000);

  it("holds a static face-aware crop when the subject does not move", async () => {
    const out = await render({
      name: "face-static",
      width: 1080,
      height: 1920,
      cropMode: "face",
      start: 0,
      end: 3,
      track: { srcWidth: 1280, srcHeight: 720, points: [{ t: 0, cx: 0.9, cy: 0.5 }, { t: 3, cx: 0.9, cy: 0.5 }] },
    });
    const [r, , b] = averageColor(out, 2.5);
    expect(b).toBeGreaterThan(r + 100);
  }, 120_000);
});
