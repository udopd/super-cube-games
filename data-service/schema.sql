CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  email_verified SMALLINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  public_id TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS identities (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_subject), UNIQUE(user_id, provider)
);
CREATE TABLE IF NOT EXISTS games (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  capsule_path TEXT NOT NULL,
  entry_path TEXT NOT NULL DEFAULT 'index.html',
  min_players INTEGER NOT NULL DEFAULT 1,
  max_players INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  description_ru TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  tags_ru_json TEXT NOT NULL DEFAULT '[]',
  tags_en_json TEXT NOT NULL DEFAULT '[]',
  runtime_type TEXT NOT NULL DEFAULT 'browser' CHECK(runtime_type IN ('browser','server')),
  archive_bytes BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS play_sessions (
  id TEXT PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  guest_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_seen_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'direct',
  is_active SMALLINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_plays_game_started ON play_sessions(game_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_plays_user_started ON play_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_plays_active_seen ON play_sessions(is_active, last_seen_at DESC) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS game_events (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  guest_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direct',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_game_type ON game_events(game_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_type ON game_events(user_id, event_type, created_at DESC);
CREATE TABLE IF NOT EXISTS ratings (
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(game_id, user_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES reviews(id) ON DELETE CASCADE,
  is_admin_reply SMALLINT NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_game_created ON reviews(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user_game ON reviews(user_id, game_id);
CREATE TABLE IF NOT EXISTS favorites (
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(game_id, user_id)
);
CREATE TABLE IF NOT EXISTS cloud_saves (
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(game_id, user_id)
);
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metric_snapshots (
  period TEXT NOT NULL CHECK(period IN ('minute','day')),
  bucket_at TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  game_id BIGINT,
  ccu INTEGER NOT NULL DEFAULT 0,
  daily_players INTEGER NOT NULL DEFAULT 0,
  sessions BIGINT NOT NULL DEFAULT 0,
  total_seconds BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(period,bucket_at,scope_key)
);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_bucket ON metric_snapshots(period,bucket_at DESC);
CREATE TABLE IF NOT EXISTS app_sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expire ON app_sessions(expire);
