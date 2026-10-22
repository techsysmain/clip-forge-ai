import { spawn } from "node:child_process";
import { env } from "./env";
import { PipelineError } from "./ai";

export const OUTPUT_SIZES = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
} as const;

export type AspectRatio = keyof typeof OUTPUT_SIZES;
export type CropMode = "center" | "blur";

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

export async function extractAudio(input: string, output: string): Promise<void> {
  await run(
    env.ffmpegPath,
    ["-hide_banner", "-nostdin", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "24k", "-f", "mp3", output],
    { timeoutMs: 30 * 60 * 1000 },
  );
}

export function buildFilter(width: number, height: number, cropMode: CropMode, assFile: string): string {
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
    "-filter_complex", buildFilter(a.width, a.height, a.cropMode, "subs.ass"),
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
