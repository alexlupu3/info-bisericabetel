-- Soft-delete support: add a partial index for efficient filtering of deleted items.
-- The state column is already TEXT; no schema change needed for the new 'deleted' value.
CREATE INDEX IF NOT EXISTS content_items_deleted_idx
  ON content_items (state)
  WHERE state = 'deleted';
