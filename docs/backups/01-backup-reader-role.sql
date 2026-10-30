-- #96 — read-only database login used by the nightly backup job.
--
-- Run ONCE per project in the Supabase SQL Editor (Mark pastes; Claude cannot
-- write to PROD). Replace PASTE_PASSWORD_HERE with the generated password
-- first — the same password goes into the BACKUP_DB_URL GitHub secret.
-- Never commit the real password.
--
-- What the login can do: read every table and sequence in the public schema
-- (bookings, customers, parq, settings, ...). What it cannot do: write,
-- delete, or change any table — it has no write grants. Sessions also start
-- read-only by default (a second guard, though a session could switch it
-- off). Like any login it can call functions open to everyone — no more
-- than the public booking page can already do; admin functions refuse it
-- because their is_admin() check fails.
--
-- BYPASSRLS is needed because pg_dump refuses to dump a table whose row-level
-- security would hide rows from it (it would otherwise produce a silently
-- partial backup). It only lifts the row filter; the read-only limits above
-- still apply.
--
-- All-or-nothing: if any statement fails, nothing is created.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_reader') THEN
    RAISE EXCEPTION 'backup_reader already exists — nothing changed. To reset its password: ALTER ROLE backup_reader PASSWORD ''...'';';
  END IF;
END $$;

CREATE ROLE backup_reader LOGIN BYPASSRLS PASSWORD 'PASTE_PASSWORD_HERE';
ALTER ROLE backup_reader SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA public TO backup_reader;
GRANT SELECT ON ALL TABLES    IN SCHEMA public TO backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader;

-- Tables added by future migrations are readable too, so they are never
-- silently left out of the backup.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES    TO backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_reader;

COMMIT;
