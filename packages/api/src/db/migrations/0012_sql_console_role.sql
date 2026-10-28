-- Low-privilege role the SQL console switches to (SET LOCAL ROLE) for every query.
-- It can read and write application data, but cannot write users, audit_log or
-- _migrations, cannot read password hashes, cannot move sequences (no setval),
-- and has none of the server file/admin function privileges.
--
-- Creating a role needs SUPERUSER or CREATEROLE. Without it this migration only
-- warns, and the console reports itself unavailable until a DBA runs this block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'betel_sql_console') THEN
    CREATE ROLE betel_sql_console NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT betel_sql_console TO %I', current_user);

  GRANT USAGE ON SCHEMA public TO betel_sql_console;
  REVOKE CREATE ON SCHEMA public FROM betel_sql_console;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO betel_sql_console;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO betel_sql_console;
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO betel_sql_console', current_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO betel_sql_console', current_user);

  -- Protected tables: read-only, and no password hashes
  REVOKE ALL ON users, audit_log, _migrations FROM betel_sql_console;
  GRANT SELECT ON audit_log, _migrations TO betel_sql_console;
  GRANT SELECT (id, email, role, must_change_password, created_at, updated_at) ON users TO betel_sql_console;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'betel_sql_console role not set up (insufficient privilege): the SQL console stays unavailable until a superuser runs 0012_sql_console_role.sql';
END $$;
