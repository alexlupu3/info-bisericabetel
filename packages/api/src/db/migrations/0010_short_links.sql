CREATE TABLE IF NOT EXISTS short_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  site_slug       TEXT REFERENCES sites(slug) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS short_links_content_item_idx ON short_links (content_item_id);

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS short_link_id UUID;

ALTER TABLE analytics_events
  ADD CONSTRAINT analytics_events_short_link_id_fkey
  FOREIGN KEY (short_link_id) REFERENCES short_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analytics_events_short_link_id_idx ON analytics_events (short_link_id);
