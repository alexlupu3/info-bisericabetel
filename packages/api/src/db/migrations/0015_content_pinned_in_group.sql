-- Spec 08 (section preview): pin an item to the front of its group's phone preview (FR-103, BR-057).
ALTER TABLE "content_items" ADD COLUMN IF NOT EXISTS "pinned_in_group" BOOLEAN NOT NULL DEFAULT false;
