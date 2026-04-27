-- Supported languages
CREATE TABLE IF NOT EXISTS "languages" (
  "code"       TEXT PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Romanian as default + English as first extra language
INSERT INTO "languages" ("code", "name", "is_default", "enabled")
VALUES ('ro', 'Română', TRUE, TRUE)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "languages" ("code", "name", "is_default", "enabled")
VALUES ('en', 'English', FALSE, TRUE)
ON CONFLICT ("code") DO NOTHING;

-- Static UI text translations (key-value per locale)
CREATE TABLE IF NOT EXISTS "ui_translations" (
  "locale"     TEXT NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "key"        TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("locale", "key")
);

-- Content translations (per content_item, per locale)
CREATE TABLE IF NOT EXISTS "content_translations" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "content_item_id" UUID NOT NULL REFERENCES "content_items"("id") ON DELETE CASCADE,
  "locale"          TEXT NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "data"            JSONB NOT NULL DEFAULT '{}',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("content_item_id", "locale")
);

CREATE INDEX IF NOT EXISTS "content_translations_item_idx"
  ON "content_translations" ("content_item_id");

-- Group title translations (per group, per locale)
CREATE TABLE IF NOT EXISTS "group_translations" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id"   UUID NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "locale"     TEXT NOT NULL REFERENCES "languages"("code") ON DELETE CASCADE,
  "title"      TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("group_id", "locale")
);
