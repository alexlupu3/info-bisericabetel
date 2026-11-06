-- Spec 08 follow-up: a group can opt out of the phone section preview (card deck); default on.
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "section_preview" BOOLEAN NOT NULL DEFAULT true;
