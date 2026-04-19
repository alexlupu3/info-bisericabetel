CREATE INDEX IF NOT EXISTS analytics_events_item_occurred_idx
  ON analytics_events (item_id, occurred_at)
  WHERE item_id IS NOT NULL;
