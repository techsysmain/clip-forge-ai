CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE magic_tokens (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX magic_tokens_email_idx ON magic_tokens (email, created_at DESC);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url text,
  source_type text NOT NULL CHECK (source_type IN ('youtube', 'upload', 'url')),
  youtube_video_id text,
  direct_url text,
  title text NOT NULL,
  channel text,
  thumbnail_url text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  status text NOT NULL DEFAULT 'awaiting_source'
    CHECK (status IN ('awaiting_source', 'queued', 'fetching_source', 'transcribing', 'analyzing', 'ready', 'failed')),
  source_storage_key text,
  transcript jsonb,
  video_summary text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  rights_confirmed boolean NOT NULL DEFAULT false CHECK (rights_confirmed),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_idx ON projects (user_id, created_at DESC);

CREATE TABLE clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  start_seconds numeric(10,3) NOT NULL CHECK (start_seconds >= 0),
  end_seconds numeric(10,3) NOT NULL,
  hook text,
  summary text,
  reason text,
  transcript text,
  engagement_score integer NOT NULL CHECK (engagement_score BETWEEN 0 AND 100),
  aspect_ratio text NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '16:9', '1:1')),
  crop_mode text NOT NULL DEFAULT 'center' CHECK (crop_mode IN ('center', 'blur')),
  caption_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'queued', 'rendering', 'rendered', 'failed')),
  output_storage_key text,
  subtitle_storage_key text,
  output_width integer,
  output_height integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clips_range CHECK (end_seconds > start_seconds AND end_seconds - start_seconds <= 60)
);
CREATE INDEX clips_project_idx ON clips (project_id, engagement_score DESC);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  clip_id uuid REFERENCES clips(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('analyze', 'render')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'fetching_source', 'transcribing', 'analyzing', 'rendering', 'completed', 'failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 2,
  run_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_render_needs_clip CHECK (job_type <> 'render' OR clip_id IS NOT NULL)
);
CREATE INDEX jobs_project_idx ON jobs (project_id, created_at DESC);
CREATE INDEX jobs_claim_idx ON jobs (run_at) WHERE status = 'queued';
-- Idempotency: at most one active job per target
CREATE UNIQUE INDEX jobs_active_unique ON jobs (job_type, project_id, COALESCE(clip_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status NOT IN ('completed', 'failed');
