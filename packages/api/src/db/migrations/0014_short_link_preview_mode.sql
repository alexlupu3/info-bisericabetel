-- Spec 06 (FR-088): per-short-link choice between the content-based link preview served
-- to link-preview crawlers and the destination's own preview (today's plain 302).
ALTER TABLE short_links
  ADD COLUMN IF NOT EXISTS preview_mode TEXT NOT NULL DEFAULT 'content'
  CHECK (preview_mode IN ('content', 'destination'));
