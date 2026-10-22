import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { PipelineError } from "./pipeline-error";
import { trackCropFilter, type FacePoint } from "./facetrack";

export const OUTPUT_SIZES = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
} as const;

export type AspectRatio = keyof typeof OUTPUT_SIZES;
export type CropMode = "center" | "blur" | "face";

/** Runs a binary with an argument array (never through a shell). */
function run(
  bin: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number; onStdoutLine?: (line: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let buf = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      if (opts.onStdoutLine) {
        buf += s;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(opts.onStdoutLine);
      } else out += s;
    });
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        (e as NodeJS.ErrnoException).code === "ENOENT"
          ? new PipelineError("FFmpeg is not installed on the worker.")
          : new PipelineError("Video processing could not start."),
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      console.error(`[ffmpeg] ${bin} exited ${code} ${signal ?? ""}\n${err}`);
      reject(new PipelineError(signal ? "Video processing timed out." : "Video processing failed.", !!signal));
    });
  });
}

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export async function probe(file: string): Promise<ProbeResult> {
  let out: string;
  try {
    out = await run(
      env.ffprobePath,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { timeoutMs: 60000 },
    );
  } catch {
    throw new PipelineError("The file is not a valid video.");
  }
  const j = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: { codec_type: string; width?: number; height?: number; duration?: string }[];
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.some((s) => s.codec_type === "audio") ?? false;
  const duration = parseFloat(j.format?.duration ?? v?.duration ?? "0");
  if (!v?.width || !v.height || !(duration > 0)) throw new PipelineError("The file is not a valid video.");
  return { duration, width: v.width, height: v.height, hasAudio: a };
}

export async function extractAudio(input: string, output: string, kbps = 24): Promise<void> {
  await run(
    env.ffmpegPath,
    ["-hide_banner", "-nostdin", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", `${kbps}k`, "-f", "mp3", output],
    { timeoutMs: 30 * 60 * 1000 },
  );
}

export interface FrameFile {
  time: number;
  file: string;
}

/** Extracts one downscaled JPEG per timestamp (seconds into the input). Frames that cannot be decoded are skipped. */
export async function extractFrames(input: string, times: number[], outDir: string, scaleWidth = 640): Promise<FrameFile[]> {
  const results: (FrameFile | null)[] = new Array(times.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < times.length) {
      const i = next++;
      const file = path.join(outDir, `frame_${i}.jpg`);
      try {
        await run(
          env.ffmpegPath,
          ["-hide_banner", "-nostdin", "-y", "-ss", times[i].toFixed(3), "-i", input, "-frames:v", "1", "-vf", `scale=${scaleWidth}:-2`, "-q:v", "5", file],
          { timeoutMs: 120_000 },
        );
        if (fs.existsSync(file)) results[i] = { time: times[i], file };
      } catch {
        // a single undecodable frame must not fail the whole job
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return results.filter((r): r is FrameFile => r !== null);
}

export function buildFilter(
  width: number,
  height: number,
  cropMode: CropMode,
  assFile: string,
  track?: { points: FacePoint[]; srcWidth: number; srcHeight: number } | null,
): string {
  if (cropMode === "face" && track && track.points.length > 0) {
    return trackCropFilter({ width, height, assFile, ...track });
  }
  const base = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  if (cropMode === "blur") {
    return (
      `[0:v]split=2[a][b];[a]${base},boxblur=30:3[bg];` +
      `[b]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,ass=${assFile}[v]`
    );
  }
  return `[0:v]${base},setsar=1,ass=${assFile}[v]`;
}

export interface RenderArgs {
  input: string;
  start: number;
  end: number;
  width: number;
  height: number;
  cropMode: CropMode;
  /** Subject path for cropMode "face"; without it the crop falls back to center. */
  track?: { points: FacePoint[]; srcWidth: number; srcHeight: number } | null;
  /** Directory containing subs.ass; output is written to out.mp4 inside it */
  workDir: string;
  onProgress?: (fraction: number) => void;
}

export async function renderClip(a: RenderArgs): Promise<void> {
  const duration = a.end - a.start;
  const args = [
    "-hide_banner", "-nostdin", "-y",
    "-ss", a.start.toFixed(3),
    "-i", a.input,
    "-t", duration.toFixed(3),
    "-filter_complex", buildFilter(a.width, a.height, a.cropMode, "subs.ass", a.track),
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "-threads", "2",
    "-progress", "pipe:1",
    "out.mp4",
  ];
  await run(env.ffmpegPath, args, {
    cwd: a.workDir,
    timeoutMs: 20 * 60 * 1000,
    onStdoutLine: (line) => {
      const m = /^out_time_ms=(\d+)/.exec(line);
      if (m && a.onProgress) a.onProgress(Math.min(1, parseInt(m[1], 10) / 1e6 / duration));
    },
  });
}
