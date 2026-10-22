CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  notify_email TINYINT(1) NOT NULL DEFAULT 1,
  terms_accepted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY users_email_uq (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE magic_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY magic_tokens_email_idx (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  source_url VARCHAR(2048) NULL,
  source_type VARCHAR(16) NOT NULL,
  youtube_video_id VARCHAR(16) NULL,
  direct_url VARCHAR(2048) NULL,
  title VARCHAR(255) NOT NULL,
  channel VARCHAR(255) NULL,
  thumbnail_url VARCHAR(2048) NULL,
  duration_seconds INT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'awaiting_source',
  source_storage_key VARCHAR(255) NULL,
  transcript JSON NULL,
  video_summary TEXT NULL,
  settings JSON NOT NULL,
  rights_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY projects_user_idx (user_id, created_at),
  KEY projects_created_idx (created_at),
  CONSTRAINT projects_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT projects_source_type_ck CHECK (source_type IN ('youtube', 'upload', 'url')),
  CONSTRAINT projects_status_ck CHECK (status IN ('awaiting_source', 'queued', 'fetching_source', 'transcribing', 'analyzing', 'ready', 'failed')),
  CONSTRAINT projects_duration_ck CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  CONSTRAINT projects_rights_ck CHECK (rights_confirmed = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clips (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  start_seconds DECIMAL(10,3) NOT NULL,
  end_seconds DECIMAL(10,3) NOT NULL,
  hook TEXT NULL,
  summary TEXT NULL,
  reason TEXT NULL,
  transcript TEXT NULL,
  engagement_score INT NOT NULL,
  aspect_ratio VARCHAR(8) NOT NULL DEFAULT '9:16',
  crop_mode VARCHAR(8) NOT NULL DEFAULT 'center',
  caption_style JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'suggested',
  output_storage_key VARCHAR(255) NULL,
  subtitle_storage_key VARCHAR(255) NULL,
  output_width INT NULL,
  output_height INT NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY clips_project_idx (project_id, engagement_score),
  CONSTRAINT clips_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT clips_start_ck CHECK (start_seconds >= 0),
  CONSTRAINT clips_range_ck CHECK (end_seconds > start_seconds AND end_seconds - start_seconds <= 60),
  CONSTRAINT clips_score_ck CHECK (engagement_score BETWEEN 0 AND 100),
  CONSTRAINT clips_aspect_ck CHECK (aspect_ratio IN ('9:16', '16:9', '1:1')),
  CONSTRAINT clips_crop_ck CHECK (crop_mode IN ('center', 'blur')),
  CONSTRAINT clips_status_ck CHECK (status IN ('suggested', 'queued', 'rendering', 'rendered', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  clip_id CHAR(36) NULL,
  job_type VARCHAR(8) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 2,
  run_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  heartbeat_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  -- Idempotency: NULL once finished, otherwise unique per (type, target) so only one job can be active
  active_key VARCHAR(64) GENERATED ALWAYS AS (
    IF(status IN ('completed', 'failed'), NULL, CONCAT(job_type, ':', COALESCE(clip_id, project_id)))
  ) VIRTUAL,
  UNIQUE KEY jobs_active_uq (active_key),
  KEY jobs_project_idx (project_id, created_at),
  KEY jobs_claim_idx (status, run_at),
  CONSTRAINT jobs_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT jobs_clip_fk FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
  CONSTRAINT jobs_type_ck CHECK (job_type IN ('analyze', 'render')),
  CONSTRAINT jobs_status_ck CHECK (status IN ('queued', 'fetching_source', 'transcribing', 'analyzing', 'rendering', 'completed', 'failed')),
  CONSTRAINT jobs_progress_ck CHECK (progress BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
