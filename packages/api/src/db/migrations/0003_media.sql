CREATE TABLE IF NOT EXISTS media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url           TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  size          INTEGER NOT NULL DEFAULT 0,
  mime_type     TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
