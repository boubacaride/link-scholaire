-- ═══════════════════════════════════════════════════════════════════
-- Migration health check
-- ───────────────────────────────────────────────────────────────────
-- Supabase does NOT track migrations applied by hand in the SQL Editor,
-- so this probes for the key database object each important migration
-- creates and reports whether it's present. Run the whole file in the
-- Supabase SQL Editor. Any row with present = false means that migration
-- (or part of it) has NOT been applied — run the matching file.
-- ═══════════════════════════════════════════════════════════════════

WITH checks(migration, object_type, schema_name, object_name, column_name) AS (
  VALUES
    ('004/049 · create_user_with_profile',     'function', 'public', 'create_user_with_profile',      NULL),
    ('006 · meetings',                          'table',    'public', 'meetings',                      NULL),
    ('007 · messages',                          'table',    'public', 'messages',                      NULL),
    ('009/049 · create_school_with_admin',      'function', 'public', 'create_school_with_admin',      NULL),
    ('009 · get_user_context',                  'function', 'public', 'get_user_context',              NULL),
    ('010 · update_school_admin',               'function', 'public', 'update_school_admin',           NULL),
    ('011 · delete_school_admin',               'function', 'public', 'delete_school_admin',           NULL),
    ('012 · schools.access_suspended',          'column',   'public', 'schools',                       'access_suspended'),
    ('013 · delete_school',                     'function', 'public', 'delete_school',                 NULL),
    ('029 · profiles.institutional_id',         'column',   'public', 'profiles',                      'institutional_id'),
    ('038 · content.report_card_comment*',      'table',    'public', 'report_card_comments',          NULL),
    ('039 · performance_snapshots',             'table',    'public', 'performance_snapshots',         NULL),
    ('040 · perf_class_students',               'function', 'public', 'perf_class_students',           NULL),
    ('042 · perf_teachers',                     'function', 'public', 'perf_teachers',                 NULL),
    ('044 · perf_school_summary',               'function', 'public', 'perf_school_summary',           NULL),
    ('045 · profiles.salary',                   'column',   'public', 'profiles',                      'salary'),
    ('046 · payslips',                          'table',    'public', 'payslips',                      NULL),
    ('046 · acknowledge_payslip',               'function', 'public', 'acknowledge_payslip',           NULL),
    ('048 · payslips.share_token',              'column',   'public', 'payslips',                      'share_token'),
    ('048 · get_payslip_share',                 'function', 'public', 'get_payslip_share',             NULL),
    ('048 · acknowledge_payslip_by_token',      'function', 'public', 'acknowledge_payslip_by_token',  NULL)
)
SELECT
  migration,
  object_type AS kind,
  CASE
    WHEN object_type = 'table'    THEN to_regclass(schema_name || '.' || object_name) IS NOT NULL
    WHEN object_type = 'column'   THEN EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = schema_name AND c.table_name = object_name AND c.column_name = column_name)
    WHEN object_type = 'function' THEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = schema_name AND p.proname = object_name)
  END AS present
FROM checks
ORDER BY migration;

-- ─── Bonus: any auth.users rows still carrying NULL token columns? ────
-- These rows cannot sign in ("Database error querying schema"). After
-- migration 049 this MUST return 0. If it's > 0, run migration 049.
SELECT count(*) AS users_with_null_token_columns
FROM auth.users
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;
