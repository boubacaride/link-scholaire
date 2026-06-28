-- ═══════════════════════════════════════════════════════════════════
-- 044 · Live whole-school KPI summary
-- ───────────────────────────────────────────────────────────────────
-- The dashboard's KPI cards previously read the latest monthly snapshot,
-- which is month-scoped: if grades land in the current month but attendance
-- doesn't (or vice-versa), a card reads 0 while the live drill-down shows the
-- real figure. This RPC computes the whole-school numbers LIVE (same method
-- as perf_grade_levels), so the KPI cards always match the drill-down.
--   academic_average = flat mean of student averages
--   attendance_rate  = house standard over all recorded sessions
--   pass_rate        = % of graded students ≥ 60
--   below_target     = grade levels with academic < 60 OR attendance < 90
-- Optional p_start/p_end (NULL = all-time). SECURITY DEFINER, admin-only,
-- school-scoped. Snapshots remain the source for the month-over-month Trends.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.perf_school_summary(
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS TABLE (
  academic_average NUMERIC, attendance_rate NUMERIC, pass_rate NUMERIC,
  students INT, grade_levels INT, below_target INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_school UUID := public.auth_school_id();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  WITH student_levels AS (
    SELECT DISTINCT ON (sc.student_id) sc.student_id, c.grade::text AS grade_level
    FROM student_classes sc JOIN classes c ON c.id = sc.class_id
    WHERE c.school_id = v_school
    ORDER BY sc.student_id, sc.enrolled_at DESC
  ),
  row_pct AS (
    SELECT g.student_id, g.score / NULLIF(g.max_score, 0) * 100.0 AS pct
    FROM grades g
    WHERE g.school_id = v_school
      AND (p_start IS NULL OR g.created_at >= p_start)
      AND (p_end   IS NULL OR g.created_at <  p_end)
  ),
  student_overall AS (SELECT student_id, AVG(pct) AS overall_pct FROM row_pct GROUP BY student_id),
  att AS (
    SELECT a.student_id,
           COUNT(*) FILTER (WHERE a.status IN ('present','late')) AS present_cnt,
           COUNT(*) AS total_cnt
    FROM attendance a
    WHERE a.school_id = v_school
      AND (p_start IS NULL OR a.date >= p_start)
      AND (p_end   IS NULL OR a.date <  p_end)
    GROUP BY a.student_id
  ),
  per_student AS (
    SELECT sl.grade_level, so.overall_pct,
           COALESCE(att.present_cnt,0) AS present_cnt, COALESCE(att.total_cnt,0) AS total_cnt
    FROM student_levels sl
    LEFT JOIN student_overall so ON so.student_id = sl.student_id
    LEFT JOIN att ON att.student_id = sl.student_id
  ),
  by_level AS (
    SELECT grade_level,
           ROUND(AVG(overall_pct)::numeric, 2) AS academic_average,
           CASE WHEN SUM(total_cnt) > 0 THEN ROUND(100.0*SUM(present_cnt)/SUM(total_cnt), 2) END AS attendance_rate
    FROM per_student GROUP BY grade_level
  ),
  school AS (
    SELECT ROUND(AVG(overall_pct)::numeric, 2) AS academic_average,
           CASE WHEN SUM(total_cnt) > 0 THEN ROUND(100.0*SUM(present_cnt)/SUM(total_cnt), 2) END AS attendance_rate,
           ROUND(100.0 * COUNT(*) FILTER (WHERE overall_pct >= 60) / NULLIF(COUNT(overall_pct),0), 2) AS pass_rate,
           COUNT(overall_pct)::int AS students
    FROM per_student
  )
  SELECT s.academic_average, s.attendance_rate, s.pass_rate, s.students,
         (SELECT COUNT(*)::int FROM by_level),
         (SELECT COUNT(*)::int FROM by_level
          WHERE (academic_average IS NOT NULL AND academic_average < 60)
             OR (attendance_rate IS NOT NULL AND attendance_rate < 90))
  FROM school s;
END; $$;
GRANT EXECUTE ON FUNCTION public.perf_school_summary(DATE, DATE) TO authenticated;
