CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  user_email  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'content',
  entity_id   UUID,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
