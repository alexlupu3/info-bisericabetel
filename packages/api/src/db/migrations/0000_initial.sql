CREATE TABLE IF NOT EXISTS "sites" (
  "slug"       TEXT        PRIMARY KEY,
  "name"       TEXT        NOT NULL,
  "accent"     TEXT        NOT NULL,
  "address"    TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "groups" (
  "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "title"          TEXT        NOT NULL,
  "sites"          TEXT[]      NOT NULL DEFAULT '{}',
  "order_position" INTEGER     NOT NULL DEFAULT 0,
  "state"          TEXT        NOT NULL DEFAULT 'draft',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "content_items" (
  "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"           TEXT        NOT NULL,
  "state"          TEXT        NOT NULL DEFAULT 'draft',
  "sites"          TEXT[]      NOT NULL DEFAULT '{}',
  "order_position" INTEGER     NOT NULL DEFAULT 0,
  "group_id"       UUID        REFERENCES "groups"("id"),
  "expires_at"     TIMESTAMPTZ,
  "data"           JSONB       NOT NULL DEFAULT '{}',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the four church sites
INSERT INTO "sites" ("slug", "name", "accent") VALUES
  ('manastur', 'Mănăștur', '#17d3c3'),
  ('centru',   'Centru',   '#ff6200'),
  ('vest',     'Vest',     '#a0384b'),
  ('est',      'Est',      '#ffd000')
ON CONFLICT ("slug") DO NOTHING;
