function int(name: string, d: number): number {
  const v = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : d;
}

export type AiProvider = "openai" | "gemini";

export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get authSecret() {
    const s = process.env.AUTH_SECRET ?? "";
    if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not configured");
    return s || "dev-only-insecure-secret-change-me-please-32b";
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get storageDir() {
    return process.env.STORAGE_DIR ?? "./storage";
  },
  /** "disk" (shared volume, default) or "s3" (any S3-compatible object store). */
  get storageDriver(): "disk" | "s3" {
    return (process.env.STORAGE_DRIVER ?? "").toLowerCase() === "s3" ? "s3" : "disk";
  },
  get s3Bucket() {
    return process.env.S3_BUCKET ?? "";
  },
  get s3Region() {
    return process.env.S3_REGION ?? "us-east-1";
  },
  get s3Endpoint() {
    return process.env.S3_ENDPOINT || undefined;
  },
  get s3AccessKeyId() {
    return process.env.S3_ACCESS_KEY_ID ?? "";
  },
  get s3SecretAccessKey() {
    return process.env.S3_SECRET_ACCESS_KEY ?? "";
  },
  get s3ForcePathStyle() {
    return (process.env.S3_FORCE_PATH_STYLE ?? "").toLowerCase() === "true";
  },
  get s3Prefix() {
    return (process.env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
  },
  /** Maximum number of video frames sent to the vision model per project analysis. */
  get maxAnalysisFrames() {
    return int("VISION_MAX_FRAMES", 24);
  },
  get openaiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get openaiBase() {
    return process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  },
  get transcriptionModel() {
    return process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";
  },
  get analysisModel() {
    return process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";
  },
  get geminiKey() {
    return process.env.GEMINI_API_KEY ?? "";
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  },
  /** AI_PROVIDER wins; otherwise whichever key is configured (OpenAI first). */
  get aiProvider(): AiProvider | null {
    const p = (process.env.AI_PROVIDER ?? "").toLowerCase();
    if (p === "openai" || p === "gemini") return p;
    if (this.openaiKey) return "openai";
    if (this.geminiKey) return "gemini";
    return null;
  },
  get resendKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "ClipForge AI <onboarding@resend.dev>";
  },
  get youtubeKey() {
    return process.env.YOUTUBE_API_KEY ?? "";
  },
  get maxUploadBytes() {
    return int("MAX_UPLOAD_MB", 1024) * 1024 * 1024;
  },
  get maxSourceSeconds() {
    return int("MAX_SOURCE_SECONDS", 7200);
  },
  get retentionDays() {
    return int("RETENTION_DAYS", 30);
  },
  get workerConcurrency() {
    return int("WORKER_CONCURRENCY", 1);
  },
  get ffmpegPath() {
    return process.env.FFMPEG_PATH ?? "ffmpeg";
  },
  get ffprobePath() {
    return process.env.FFPROBE_PATH ?? "ffprobe";
  },
};
