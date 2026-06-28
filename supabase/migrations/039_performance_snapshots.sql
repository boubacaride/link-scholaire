-- ═══════════════════════════════════════════════════════════════════
-- 039 · Performance history layer — monthly snapshots
-- ───────────────────────────────────────────────────────────────────
-- Month-over-month comparison needs persisted history; it cannot be
-- reconstructed after the fact. This adds `performance_snapshots` (one
-- row per school × grade-level × month, plus an 'ALL' whole-school row)
-- and `capture_performance_snapshot(p_month)` which computes that month's
-- ACADEMIC AVERAGE (flat unweighted mean of mark %s, bucketed by
-- grades.created_at) and ATTENDANCE RATE (house standard) and upserts
-- idempotently.
--
-- Adapted from the project spec to this codebase's conventions:
--   • uuid_generate_v4() (not gen_random_uuid()) — matches every table.
--   • RLS via is_admin() + auth_school_id() (migration 003) — the spec's
--     `profiles.id = auth.uid() and role='admin'` is wrong here:
--     profiles link by user_id, and admin roles are school/platform_admin.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.performance_snapshots (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_level       TEXT NOT NULL,            -- a classes.grade value, or 'ALL' for whole-school
  period_month      DATE NOT NULL,            -- first day of month, e.g. 2026-06-01
  academic_average  NUMERIC(5,2),             -- flat unweighted mean of mark %s (0..100)
  attendance_rate   NUMERIC(5,2),             -- 0..100 (house standard), null when no sessions
  students_counted  INTEGER NOT NULL DEFAULT 0,
  academic_year     TEXT,                     -- informational, nullable (source is inconsistent)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT performance_snapshots_unique
    UNIQUE (school_id, grade_level, period_month)
);

CREATE INDEX IF NOT EXISTS idx_perf_snap_lookup
  ON public.performance_snapshots (school_id, grade_level, period_month);


-- ─── RLS: admins read only their own school's snapshots ───────────────
-- Writes happen only via the SECURITY DEFINER RPC, so no INSERT policy.
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own school snapshots" ON public.performance_snapshots;
CREATE POLICY "Admins read own school snapshots"
  ON public.performance_snapshots
  FOR SELECT
  USING (public.is_admin() AND school_id = public.auth_school_id());


-- ─── RPC: capture one month's snapshot for every school ───────────────
-- academic = FLAT unweighted mean of mark %s (Σ(score/max·100)/n), the
--            dashboard formula — NOT weighted by class_subjects.coefficient.
-- attendance = (present + late) / (present + late + absent + excused)  (house standard)
-- grade level = student → student_classes.class_id → classes.grade,
--               using the MOST RECENT enrollment.
CREATE OR REPLACE FUNCTION public.capture_performance_snapshot(p_month DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := date_trunc('month', p_month)::date;
  v_end   DATE := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  WITH
  -- (1) one grade level per student = most recent enrollment
  student_levels AS (
    SELECT DISTINCT ON (sc.student_id)
           sc.student_id,
           c.school_id,
           c.grade::text AS grade_level
    FROM student_classes sc
    JOIN classes c ON c.id = sc.class_id
    ORDER BY sc.student_id, sc.enrolled_at DESC
  ),
  -- (2) each mark recorded this month -> its percentage
  row_pct AS (
    SELECT g.student_id,
           g.score / NULLIF(g.max_score, 0) * 100.0 AS pct
    FROM grades g
    WHERE g.created_at >= v_start AND g.created_at < v_end
  ),
  -- (3) student moyenne = FLAT mean of all their mark %s (dashboard formula)
  student_overall AS (
    SELECT student_id, AVG(pct) AS overall_pct
    FROM row_pct
    GROUP BY student_id
  ),
  -- (4) attendance this month; attended = present + late; excused counted as missed
  att AS (
    SELECT a.student_id,
           COUNT(*) FILTER (WHERE a.status IN ('present','late')) AS present_cnt,
           COUNT(*) AS total_cnt
    FROM attendance a
    WHERE a.date >= v_start AND a.date < v_end
    GROUP BY a.student_id
  ),
  -- (5) student-level join (keep every enrolled student; nulls handled in roll-up)
  per_student AS (
    SELECT sl.school_id, sl.grade_level, sl.student_id,
           so.overall_pct,
           COALESCE(att.present_cnt, 0) AS present_cnt,
           COALESCE(att.total_cnt, 0)   AS total_cnt
    FROM student_levels sl
    LEFT JOIN student_overall so ON so.student_id = sl.student_id
    LEFT JOIN att              ON att.student_id = sl.student_id
  ),
  -- (6) per grade level
  by_level AS (
    SELECT school_id, grade_level,
           ROUND(AVG(overall_pct)::numeric, 2) AS academic_average,
           CASE WHEN SUM(total_cnt) > 0
                THEN ROUND(100.0 * SUM(present_cnt) / SUM(total_cnt), 2) END AS attendance_rate,
           COUNT(overall_pct) AS students_counted
    FROM per_student
    GROUP BY school_id, grade_level
  ),
  -- (7) whole-school roll-up ('ALL')
  by_school AS (
    SELECT school_id, 'ALL'::text AS grade_level,
           ROUND(AVG(overall_pct)::numeric, 2) AS academic_average,
           CASE WHEN SUM(total_cnt) > 0
                THEN ROUND(100.0 * SUM(present_cnt) / SUM(total_cnt), 2) END AS attendance_rate,
           COUNT(overall_pct) AS students_counted
    FROM per_student
    GROUP BY school_id
  ),
  combined AS (
    SELECT * FROM by_level
    UNION ALL
    SELECT * FROM by_school
  )
  INSERT INTO performance_snapshots
    (school_id, grade_level, period_month, academic_average, attendance_rate, students_counted)
  SELECT school_id, grade_level, v_start, academic_average, attendance_rate, students_counted
  FROM combined
  ON CONFLICT (school_id, grade_level, period_month)
  DO UPDATE SET academic_average = EXCLUDED.academic_average,
                attendance_rate  = EXCLUDED.attendance_rate,
                students_counted = EXCLUDED.students_counted,
                updated_at = NOW();
END;
$$;

-- Callable by signed-in users; reads stay RLS-scoped per school. The cron job
-- runs it with no auth context, which is why the body can't gate on is_admin().
GRANT EXECUTE ON FUNCTION public.capture_performance_snapshot(DATE) TO authenticated;


-- ─── Schedule monthly (guarded — no-op if pg_cron is unavailable) ─────
-- Mirrors the guarded pattern in migration 037. Runs at 02:00 on the 1st,
-- capturing the month that just ended is NOT desired here: we (re)capture the
-- CURRENT month so the latest figures stay fresh; backfill is manual (below).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-perf-snapshot') THEN
      PERFORM cron.unschedule('monthly-perf-snapshot');
    END IF;
    PERFORM cron.schedule(
      'monthly-perf-snapshot',
      '0 2 1 * *',
      $cron$SELECT public.capture_performance_snapshot(date_trunc('month', now())::date)$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

-- ─── Backfill (run once after applying) ───────────────────────────────
-- Capture the current month and as many prior months as you have data for:
--   SELECT public.capture_performance_snapshot(date_trunc('month', now())::date);
--   SELECT public.capture_performance_snapshot('2026-05-01');
--   SELECT public.capture_performance_snapshot('2026-04-01');
-- Verify:
--   SELECT period_month, grade_level, academic_average, attendance_rate, students_counted
--   FROM public.performance_snapshots ORDER BY period_month, grade_level;
