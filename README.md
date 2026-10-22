# ClipForge AI

Turn long videos into captioned short-form clips. Paste a YouTube link (for metadata) and provide a video you own (upload or authorized direct URL); AI transcribes it, finds the best ≤60s moments, and a background worker renders subtitled MP4s with FFmpeg.

## Architecture

| Piece | Implementation |
|---|---|
| Web app | Next.js (App Router), Tailwind, shadcn/ui |
| Auth | Magic-link email sign-in, signed httpOnly JWT cookie (`jose`) |
| Database | PostgreSQL via `pg`; SQL migrations in `db/migrations` |
| Queue | Postgres-backed (`FOR UPDATE SKIP LOCKED`), retries with backoff, stale-job recovery, unique index prevents duplicate active jobs |
| Storage | Filesystem (`STORAGE_DIR`), shared between web and worker; downloads are streamed only after an ownership check |
| Worker | `src/worker` – source fetch → FFprobe → audio extract → OpenAI transcription (word timestamps) → AI analysis → FFmpeg render |
| AI | OpenAI Whisper (`/audio/transcriptions`) and Chat Completions with strict JSON-schema output |

Source adapters (`src/lib/sources.ts`): **upload** and **authorized direct URL** (SSRF-guarded, size-limited). YouTube URLs supply **metadata only** (YouTube Data API or public oEmbed). ClipForge never downloads from YouTube or uses unofficial extractors; if a project has no permitted source, the UI asks for an upload. YouTube captions are not used because the official captions API only serves the video owner.

## Setup

1. `cp .env.example .env` and fill in values (see below).
2. Start Postgres: `docker compose up db -d` (or use your own and set `DATABASE_URL`).
3. `npm install`, then `npm run db:migrate`.
4. Install FFmpeg + the DejaVu font on the machine that runs the worker (`brew install ffmpeg` / `apt install ffmpeg fonts-dejavu-core`).
5. Run the web app `npm run dev` and, in another terminal, the worker `npm run worker`.
6. Open http://localhost:3000, sign in. Without SMTP configured (development only) the magic link is shown on the login page and logged by the server.

Or run everything with `docker compose up --build` (then `docker compose exec web npm run db:migrate`).

### Credentials / external services

| Service | Variables | Needed for |
|---|---|---|
| PostgreSQL | `DATABASE_URL` | everything |
| OpenAI | `OPENAI_API_KEY` | transcription + analysis (worker) |
| SMTP provider | `SMTP_*` | magic-link emails in production |
| YouTube Data API v3 | `YOUTUBE_API_KEY` | optional; adds video duration to metadata |

Generate `AUTH_SECRET` with `openssl rand -base64 48`.

## Test video

`npm run fixture` creates `fixtures/sample.mp4` (synthetic pattern + tone, copyright-free). It has no speech, so for a full pipeline test upload any video you own that contains speech.

## Tests

`npm test` runs unit/integration tests (URL validation, 60s clip limits, subtitle timing/SRT/ASS, SSRF guard, AI analysis with a mocked provider, ownership checks). Rendering with real FFmpeg and browser UI tests require a running stack and are not included in this suite.

## API

`POST /api/projects`, `GET /api/projects`, `GET|DELETE /api/projects/[id]`, `PUT /api/projects/[id]/source` (streamed upload), `POST /api/projects/[id]/analyze`, `POST /api/projects/[id]/render` (batch), `GET /api/jobs/[id]`, `GET|PATCH /api/clips/[id]`, `POST /api/clips/[id]/render`, `GET /api/clips/[id]/download?type=mp4|srt`. Every user-scoped route resolves the resource through an ownership query.

## Deployment

- **Web**: Vercel works for the UI/API, but local-disk storage and long uploads do not suit serverless. For Vercel, replace `src/lib/storage.ts` with an S3-compatible implementation (same functions) and generate signed URLs in the download route; the worker must read/write the same bucket.
- **Worker**: run `npm run worker` on a container/VM with FFmpeg (see `Dockerfile`). Scale with `WORKER_CONCURRENCY` or more instances; the queue is safe for multiple workers.
- Set `APP_URL` to the public URL, configure SMTP, and run `npm run db:migrate` on deploy.

## Security & privacy

Secrets stay server-side. FFmpeg is executed with an argument array (no shell) and only validated values; caption styles are validated before generating ASS files. Remote URLs are restricted to public http(s) hosts (private/loopback/link-local blocked, redirects re-validated). Users must confirm they hold the rights to the media. Projects can be deleted at any time (removes DB rows and files); the worker also purges projects older than `RETENTION_DAYS` and temp directories after each job.

## Known limitations

- Face-aware cropping is not integrated (center crop and blurred-background fill are available).
- Video frames are not sent to the AI; analysis uses the transcript only.
- Storage is filesystem-based; S3 requires swapping the storage module.
- Source audio is sent as one file (≈24 kbps mono) to transcription, so very long videos are limited by `MAX_SOURCE_SECONDS` and the provider's 25 MB limit (~2h).

## Troubleshooting

- *"The database is not configured/unreachable"* – check `DATABASE_URL` and that migrations ran.
- *Job stays "Queued"* – the worker isn't running or can't reach the database.
- *"FFmpeg is not installed on the worker"* – install FFmpeg or set `FFMPEG_PATH`.
- *Subtitles show wrong font* – install `fonts-dejavu-core` on the worker.
- *"OpenAI is not configured"* – set `OPENAI_API_KEY` for the **worker** process.
- *Magic link invalid* – links are single-use and expire in 15 minutes; `APP_URL` must match the site URL.
