// Generates a small, copyright-free test video (synthetic pattern + sine tone) with FFmpeg.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

fs.mkdirSync("fixtures", { recursive: true });
const out = "fixtures/sample.mp4";
const r = spawnSync(
  process.env.FFMPEG_PATH ?? "ffmpeg",
  [
    "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
  ],
  { stdio: "inherit" },
);
if (r.status !== 0) {
  console.error("FFmpeg failed or is not installed.");
  process.exit(1);
}
console.log(`Wrote ${out}`);
