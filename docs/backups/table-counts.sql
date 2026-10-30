-- #96 — row count of every table in the public schema, one "table,count"
-- line each, sorted. The backup job saves this next to each dump; the
-- restore drill runs it again on the restored copy and the two must match.
-- Output is numbers only — no customer data — so it is safe in public logs.
SELECT t.table_name || ',' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.table_name),
                           false, true, '')))[1]::text
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name COLLATE "C";
