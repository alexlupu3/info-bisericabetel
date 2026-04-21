-- Site-exclusive content: pin an item to exactly one site, hiding it from the all-sites view.
-- Nullable column; existing rows default to NULL (non-exclusive). The partial index keeps
-- the all-sites filter (WHERE exclusive_site IS NULL) cheap.
ALTER TABLE content_items
  ADD COLUMN exclusive_site TEXT REFERENCES sites(slug);

CREATE INDEX IF NOT EXISTS content_items_exclusive_site_idx
  ON content_items (exclusive_site)
  WHERE exclusive_site IS NOT NULL;
