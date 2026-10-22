# ClipForge AI

Turn long videos into captioned short-form clips. Reference a YouTube video (metadata only) and provide a video you own (upload or authorized direct URL); AI transcribes it, finds the best ≤60s moments, and a background worker renders subtitled MP4 + SRT files with FFmpeg.

## Stack

| Piece | Implementation |
|---|---|
| Web | Next.js (App Router, standalone build), Tailwind, shadcn/ui |
| Auth | Magic-link email (Resend), signed httpOnly JWT cookie (`jose`) |
| Database | **MySQL 8+** via `mysql2`; migrations in `db/migrations` |
| Queue | MySQL-backed (`FOR UPDATE SKIP LOCKED`), retries with backoff, stale-job recovery, unique `active_key` index prevents duplicate active jobs |
| AI | **OpenAI** (Whisper word timestamps + JSON-schema analysis) **or Google Gemini** (transcription + structured analysis) |
| Email | **Resend** API: sign-in links and job notifications (user can opt out in Settings) |
| Storage | `STORAGE_DRIVER=disk` (default; `STORAGE_DIR` shared by web and worker) or `STORAGE_DRIVER=s3` (any S3-compatible bucket, no shared disk needed); downloads proxied only after an ownership check |
| Worker | `src/worker`: fetch source → ffprobe → audio → transcribe → sample & describe video frames → analyze → (face tracking) → FFmpeg render → notify |
| Accounts | Open registration: entering any email on `/login` creates a free account on first magic-link use |

### Video-frame analysis and face-aware crop
Both use the configured vision-capable model (OpenAI `OPENAI_ANALYSIS_MODEL`, e.g. `gpt-4o-mini`, or Gemini) on the worker; no extra service.
- **Frame analysis**: up to `VISION_MAX_FRAMES` (24) frames are sampled across the video, described, scored for visual interest and checked for faces. This context is passed alongside the transcript when choosing clips (stored in `projects.visual_notes`). If the vision call fails permanently, analysis continues transcript-only; transient errors are retried.
- **Face-aware crop** (`crop mode = face`): at render time ~1 frame per 1.5 s of the clip is inspected, the largest face is tracked, outliers are median-filtered, small moves are ignored, and FFmpeg pans the crop window with a keyframed expression. Without a detectable face (or a vision error) the clip falls back to center crop.

### Storage with S3
```
STORAGE_DRIVER=s3
S3_BUCKET=my-bucket            S3_REGION=eu-west-1
S3_ACCESS_KEY_ID=...           S3_SECRET_ACCESS_KEY=...     # or use the default AWS credential chain / IAM role
S3_ENDPOINT=https://...        S3_FORCE_PATH_STYLE=true     # only for MinIO/R2/etc.
S3_PREFIX=clipforge            # optional key prefix
```
Set the same variables on `web` and `worker`. Uploads stream to the bucket (multipart), the worker downloads the source to a temp dir while processing, and results are uploaded; the bucket needs no public access. Add a lifecycle rule to expire incomplete multipart uploads.

YouTube URLs provide **metadata only** (YouTube Data API or public oEmbed). ClipForge never downloads from YouTube. Rendering requires an uploaded file or an authorized direct file URL (SSRF-guarded).

### Choosing the AI provider
Set `OPENAI_API_KEY` **or** `GEMINI_API_KEY` on the worker (`AI_PROVIDER=openai|gemini` forces one). Differences:
- OpenAI: true word-level timestamps → highlighted current word. Audio limit 25 MB (~2 h at the configured bitrate).
- Gemini: segment-level timestamps only → captions use segment timing (no per-word highlight). Inline audio limit ≈ 14 MB (~1 h 50 min); timestamps are model-generated and may be slightly less precise.

## Run locally

1. `cp .env.example .env` and fill it in (at minimum `DATABASE_URL`, one AI key; `AUTH_SECRET` and `RESEND_API_KEY` for production).
2. MySQL 8+: `docker compose up db -d` (set `MYSQL_PASSWORD`/`MYSQL_ROOT_PASSWORD` in `.env`) or use your own.
3. `npm install` → `npm run db:migrate`.
4. Install FFmpeg + DejaVu fonts for the worker (`apt install ffmpeg fonts-dejavu-core`).
5. `npm run dev` and, in another terminal, `npm run worker`.

Without `RESEND_API_KEY`, in development the magic link appears on the login page and in the server log. In production a missing key makes sign-in fail.

## Deploy (Docker)

```
cp .env.example .env     # set AUTH_SECRET, APP_URL, MYSQL_*, AI key, RESEND_API_KEY, EMAIL_FROM, LEGAL_*
docker compose up -d --build
curl http://localhost:3000/api/health
```
`web` (Next.js standalone, non-root) and `worker` (FFmpeg; applies migrations on start) share the `storage` volume. Put a TLS-terminating reverse proxy (Caddy/nginx/Cloudflare) in front of `web`, set `APP_URL` to the public https URL, and make sure it forwards `Host`/`X-Forwarded-Host` and allows large request bodies for uploads (e.g. nginx `client_max_body_size 1100m`).

Production checklist:
- [ ] `AUTH_SECRET` set (≥32 random chars), `APP_URL` is https
- [ ] Resend domain verified and `EMAIL_FROM` uses it
- [ ] `LEGAL_*` variables filled in and the legal pages reviewed by counsel
- [ ] MySQL backups, and a backup/replication plan for the `storage` volume
- [ ] Reverse-proxy rate limiting on `/api/auth/request` and uploads
- [ ] Monitor `/api/health` and worker logs

Scaling: run more `worker` instances or raise `WORKER_CONCURRENCY`; the queue is multi-worker safe. For multiple web instances or serverless hosting, use `STORAGE_DRIVER=s3` (the `storage` volume is then unnecessary).

## Security

Security headers/CSP (production), same-origin checks on mutating API calls, per-user ownership checks on every project/clip/job/download, hashed single-use sign-in tokens with rate limits, validated FFmpeg arguments (no shell), caption styles validated before ASS generation, private `no-store` caching for user data, SSRF and size limits on remote/uploaded media, automatic data retention (`RETENTION_DAYS`), and account/project deletion.

## Legal pages

`/privacy`, `/terms`, `/cookies` (cookies & cache), `/acceptable-use`, `/copyright` (DMCA), `/subprocessors`. Operator details come from the `LEGAL_*` env vars. These are solid templates, **not legal advice**: have them reviewed for your jurisdiction (and adjust if you add analytics, payments or new subprocessors).

## Tests

`npm test`: URL validation, 60s clip limits, subtitle timing/SRT/ASS, SSRF guard, AI analysis response handling (mocked HTTP), ownership checks, plus tests that use the real thing:
- `tests/ffmpeg.test.ts` runs the real FFmpeg/ffprobe (needs FFmpeg with libass): probing, audio and frame extraction, 9:16 center and blur renders, and face-aware panning verified by decoding pixels of the output. Skipped if FFmpeg is not installed.
- `tests/storage.test.ts` runs the disk driver against a real temp dir, and the S3 driver against a real bucket when `S3_TEST_BUCKET` (plus `S3_*`/AWS credentials) is set.
- `tests/vision.test.ts` calls the real vision API when `OPENAI_API_KEY` or `GEMINI_API_KEY` is set.
- `tests/facetrack.test.ts` covers the tracking math.

`npm run fixture` creates a copyright-free sample video at `fixtures/sample.mp4` (no speech).

## API

`POST/GET /api/projects`, `GET|DELETE /api/projects/[id]`, `PUT /api/projects/[id]/source`, `POST /api/projects/[id]/analyze`, `POST /api/projects/[id]/render` (batch), `GET /api/jobs/[id]`, `GET|PATCH /api/clips/[id]`, `POST /api/clips/[id]/render`, `GET /api/clips/[id]/download?type=mp4|srt`, `GET|PATCH|DELETE /api/account`, `GET /api/health`.

## Known limitations

Face detection relies on a general vision model (bounding boxes are approximate and billed per frame), not a dedicated detector; with several people the largest face is followed. Browser UI end-to-end tests are not included.

## Troubleshooting

- *"The database is not configured/unreachable"*: check `DATABASE_URL`; the worker applies migrations on start (or `npm run db:migrate`).
- *Job stays Queued*: the worker isn't running or can't reach MySQL.
- *"No AI provider is configured"*: set `OPENAI_API_KEY` or `GEMINI_API_KEY` for the **worker**.
- *No sign-in email*: verify the Resend domain and `EMAIL_FROM`; check server logs for `[email]`.
- *Subtitles use the wrong font*: install `fonts-dejavu-core` on the worker.
