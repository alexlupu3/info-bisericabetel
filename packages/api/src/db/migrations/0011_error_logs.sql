CREATE TABLE IF NOT EXISTS error_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message      TEXT NOT NULL,
  stack        TEXT,
  url          TEXT,
  site_slug    TEXT,
  device       JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS error_logs_occurred_idx ON error_logs (occurred_at);
CREATE INDEX IF NOT EXISTS error_logs_site_occurred_idx ON error_logs (site_slug, occurred_at);
