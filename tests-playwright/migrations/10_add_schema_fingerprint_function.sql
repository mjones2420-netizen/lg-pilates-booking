-- Migration 10: schema fingerprint function
-- Adds a SECURITY DEFINER function that returns a deterministic hash of the
-- public schema's structure (columns, constraints, indexes, RLS policies,
-- functions, triggers, grants).
--
-- Used by scripts/schema-check.js to verify production and test schemas
-- remain in sync. Read-only — returns only a hash and a row count.
--
-- Self-excluded from its own fingerprint so adding it doesn't change the
-- output. Auto-generated constraint and index names are normalised so two
-- schemas with the same definitions but different auto-names match.
--
-- Apply to BOTH production and test projects.

CREATE OR REPLACE FUNCTION get_schema_fingerprint()
RETURNS TABLE(fingerprint TEXT, total_objects BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
  WITH
  columns AS (
    SELECT 'COLUMN'::text AS kind, table_name||'.'||column_name AS object,
           data_type||' '||CASE WHEN is_nullable='YES' THEN 'NULL' ELSE 'NOT NULL' END||
           COALESCE(' DEFAULT '||column_default,'') AS detail
    FROM information_schema.columns WHERE table_schema='public'
  ),
  checks AS (
    SELECT 'CHECK'::text AS kind, conrelid::regclass::text AS object,
           pg_get_constraintdef(oid) AS detail
    FROM pg_constraint
    WHERE contype='c' AND connamespace='public'::regnamespace
  ),
  fks AS (
    SELECT 'FK'::text AS kind, conrelid::regclass::text AS object,
           pg_get_constraintdef(oid) AS detail
    FROM pg_constraint
    WHERE contype='f' AND connamespace='public'::regnamespace
  ),
  unique_idx AS (
    SELECT 'UNIQUE'::text AS kind, schemaname AS object,
           regexp_replace(indexdef, 'INDEX \w+ ON', 'INDEX <auto> ON') AS detail
    FROM pg_indexes
    WHERE schemaname='public' AND indexdef ILIKE '%UNIQUE%'
  ),
  policies AS (
    SELECT 'POLICY'::text AS kind, schemaname||'.'||tablename||'.'||policyname AS object,
           cmd||' | roles='||array_to_string(roles,',')||
           ' | using='||COALESCE(qual,'NULL')||' | check='||COALESCE(with_check,'NULL') AS detail
    FROM pg_policies WHERE schemaname='public'
  ),
  rls_status AS (
    SELECT 'RLS'::text AS kind, schemaname||'.'||tablename AS object,
           CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS detail
    FROM pg_tables WHERE schemaname='public'
  ),
  fns AS (
    SELECT 'FUNCTION'::text AS kind,
           n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS object,
           'returns='||pg_get_function_result(p.oid)||
           ' | security='||CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END||
           ' | volatility='||CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS detail
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname <> 'get_schema_fingerprint'
  ),
  trgs AS (
    SELECT 'TRIGGER'::text AS kind, event_object_table||'.'||trigger_name AS object,
           action_timing||' '||event_manipulation||' '||
           CASE WHEN action_orientation='ROW' THEN 'FOR EACH ROW' ELSE 'FOR EACH STATEMENT' END||
           ' EXECUTE '||action_statement AS detail
    FROM information_schema.triggers WHERE trigger_schema='public'
  ),
  grnts AS (
    SELECT 'GRANT'::text AS kind, grantee||'.'||table_name||'.'||privilege_type AS object, 'granted' AS detail
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  ),
  fn_grnts AS (
    SELECT 'FN_GRANT'::text AS kind, r.rolname||'.'||n.nspname||'.'||p.proname AS object, 'EXECUTE granted' AS detail
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN aclexplode(p.proacl) AS acl ON true
    JOIN pg_roles r ON r.oid=acl.grantee
    WHERE n.nspname='public'
      AND r.rolname IN ('anon','authenticated')
      AND acl.privilege_type='EXECUTE'
      AND p.proname <> 'get_schema_fingerprint'
  )
  SELECT md5(string_agg(kind||'|'||object||'|'||detail, E'\n' ORDER BY kind, object, detail)) AS fingerprint,
         count(*)::bigint AS total_objects
  FROM (
    SELECT * FROM columns
    UNION ALL SELECT * FROM checks
    UNION ALL SELECT * FROM fks
    UNION ALL SELECT * FROM unique_idx
    UNION ALL SELECT * FROM policies
    UNION ALL SELECT * FROM rls_status
    UNION ALL SELECT * FROM fns
    UNION ALL SELECT * FROM trgs
    UNION ALL SELECT * FROM grnts
    UNION ALL SELECT * FROM fn_grnts
  ) all_objects;
$$;

GRANT EXECUTE ON FUNCTION get_schema_fingerprint() TO anon, authenticated;
