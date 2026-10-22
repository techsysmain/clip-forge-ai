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
| Storage | Filesystem at `STORAGE_DIR`, shared by web and worker; downloads streamed only after an ownership check |
| Worker | `src/worker`: fetch source → ffprobe → audio → transcribe → analyze → FFmpeg render → notify |

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

Scaling: run more `worker` instances or raise `WORKER_CONCURRENCY`; the queue is multi-worker safe. For multiple web instances or serverless hosting, replace `src/lib/storage.ts` with an S3-compatible implementation exposing the same functions.

## Security

Security headers/CSP (production), same-origin checks on mutating API calls, per-user ownership checks on every project/clip/job/download, hashed single-use sign-in tokens with rate limits, validated FFmpeg arguments (no shell), caption styles validated before ASS generation, private `no-store` caching for user data, SSRF and size limits on remote/uploaded media, automatic data retention (`RETENTION_DAYS`), and account/project deletion.

## Legal pages

`/privacy`, `/terms`, `/cookies` (cookies & cache), `/acceptable-use`, `/copyright` (DMCA), `/subprocessors`. Operator details come from the `LEGAL_*` env vars. These are solid templates, **not legal advice**: have them reviewed for your jurisdiction (and adjust if you add analytics, payments or new subprocessors).

## Tests

`npm test`: URL validation, 60s clip limits, subtitle timing/SRT/ASS, SSRF guard, AI analysis (OpenAI and Gemini, mocked), ownership checks. Real-FFmpeg rendering and browser UI tests need a running stack and are not included. `npm run fixture` creates a copyright-free sample video at `fixtures/sample.mp4` (no speech).

## API

`POST/GET /api/projects`, `GET|DELETE /api/projects/[id]`, `PUT /api/projects/[id]/source`, `POST /api/projects/[id]/analyze`, `POST /api/projects/[id]/render` (batch), `GET /api/jobs/[id]`, `GET|PATCH /api/clips/[id]`, `POST /api/clips/[id]/render`, `GET /api/clips/[id]/download?type=mp4|srt`, `GET|PATCH|DELETE /api/account`, `GET /api/health`.

## Known limitations

Face-aware crop is not integrated (center crop and blur fill exist); video frames are not analyzed; storage is filesystem-based; UI/browser end-to-end tests are not included.

## Troubleshooting

- *"The database is not configured/unreachable"*: check `DATABASE_URL`; the worker applies migrations on start (or `npm run db:migrate`).
- *Job stays Queued*: the worker isn't running or can't reach MySQL.
- *"No AI provider is configured"*: set `OPENAI_API_KEY` or `GEMINI_API_KEY` for the **worker**.
- *No sign-in email*: verify the Resend domain and `EMAIL_FROM`; check server logs for `[email]`.
- *Subtitles use the wrong font*: install `fonts-dejavu-core` on the worker.
