CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT NOT NULL,
  site_slug    TEXT,
  item_id      UUID,
  url          TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_occurred_idx ON analytics_events (event_type, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_site_occurred_idx ON analytics_events (site_slug, occurred_at);
