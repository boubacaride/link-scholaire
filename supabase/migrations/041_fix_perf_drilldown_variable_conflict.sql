-- ═══════════════════════════════════════════════════════════════════
-- 041 · Fix ambiguous column references in the drill-down RPCs
-- ───────────────────────────────────────────────────────────────────
-- perf_class_students declares an OUT column `student_id` (via RETURNS
-- TABLE), which PL/pgSQL treats as a variable. Inside the body, a
-- subquery `(SELECT student_id FROM enr)` then becomes ambiguous between
-- that OUT variable and the table column, raising at call time:
--   "column reference \"student_id\" is ambiguous".
-- Same idiom migration 036 used for the attendance RPCs: add
-- `#variable_conflict use_column` so unqualified names resolve to the
-- column. Re-created via CREATE OR REPLACE (idempotent) for all three so
-- the family is consistent and future-proof. Bodies are otherwise
-- identical to migration 040.
-- ═══════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.perf_grade_levels(
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS TABLE (
  grade_level TEXT, students INT, graded INT,
  academic_average NUMERIC, attendance_rate NUMERIC, pass_rate NUMERIC,
  at_risk INT,
  a_count INT, b_count INT, c_count INT, d_count INT, f_count INT
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
           COALESCE(att.present_cnt,0) AS present_cnt, COALESCE(att.total_cnt,0) AS total_cnt,
           CASE WHEN (so.overall_pct IS NOT NULL AND so.overall_pct < 60)
                  OR (att.total_cnt > 0 AND (100.0*att.present_cnt/att.total_cnt) < 90)
                THEN 1 ELSE 0 END AS at_risk
    FROM student_levels sl
    LEFT JOIN student_overall so ON so.student_id = sl.student_id
    LEFT JOIN att ON att.student_id = sl.student_id
  )
  SELECT ps.grade_level, COUNT(*)::int, COUNT(ps.overall_pct)::int,
         ROUND(AVG(ps.overall_pct)::numeric, 2),
         CASE WHEN SUM(ps.total_cnt) > 0 THEN ROUND(100.0*SUM(ps.present_cnt)/SUM(ps.total_cnt), 2) END,
         ROUND(100.0 * COUNT(*) FILTER (WHERE ps.overall_pct >= 60) / NULLIF(COUNT(ps.overall_pct),0), 2),
         SUM(ps.at_risk)::int,
         COUNT(*) FILTER (WHERE ps.overall_pct >= 90)::int,
         COUNT(*) FILTER (WHERE ps.overall_pct >= 80 AND ps.overall_pct < 90)::int,
         COUNT(*) FILTER (WHERE ps.overall_pct >= 70 AND ps.overall_pct < 80)::int,
         COUNT(*) FILTER (WHERE ps.overall_pct >= 60 AND ps.overall_pct < 70)::int,
         COUNT(*) FILTER (WHERE ps.overall_pct IS NOT NULL AND ps.overall_pct < 60)::int
  FROM per_student ps
  GROUP BY ps.grade_level
  ORDER BY ps.grade_level::int;
END; $$;
GRANT EXECUTE ON FUNCTION public.perf_grade_levels(DATE, DATE) TO authenticated;


CREATE OR REPLACE FUNCTION public.perf_classes(
  p_grade TEXT,
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS TABLE (
  class_id UUID, class_name TEXT, students INT, graded INT,
  academic_average NUMERIC, attendance_rate NUMERIC, pass_rate NUMERIC, at_risk INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_school UUID := public.auth_school_id();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  WITH cls AS (
    SELECT id, name FROM classes WHERE school_id = v_school AND grade::text = p_grade
  ),
  enr AS (
    SELECT DISTINCT sc.student_id, sc.class_id
    FROM student_classes sc JOIN cls ON cls.id = sc.class_id
  ),
  row_pct AS (
    SELECT g.student_id, g.score / NULLIF(g.max_score,0) * 100.0 AS pct
    FROM grades g
    WHERE g.school_id = v_school
      AND g.student_id IN (SELECT student_id FROM enr)
      AND (p_start IS NULL OR g.created_at >= p_start)
      AND (p_end   IS NULL OR g.created_at <  p_end)
  ),
  student_overall AS (SELECT student_id, AVG(pct) AS overall_pct FROM row_pct GROUP BY student_id),
  att AS (
    SELECT a.student_id, a.class_id,
           COUNT(*) FILTER (WHERE a.status IN ('present','late')) AS present_cnt,
           COUNT(*) AS total_cnt
    FROM attendance a
    WHERE a.school_id = v_school
      AND a.class_id IN (SELECT id FROM cls)
      AND (p_start IS NULL OR a.date >= p_start)
      AND (p_end   IS NULL OR a.date <  p_end)
    GROUP BY a.student_id, a.class_id
  ),
  per_student AS (
    SELECT e.class_id, so.overall_pct,
           COALESCE(a.present_cnt,0) AS present_cnt, COALESCE(a.total_cnt,0) AS total_cnt,
           CASE WHEN (so.overall_pct IS NOT NULL AND so.overall_pct < 60)
                  OR (a.total_cnt > 0 AND (100.0*a.present_cnt/a.total_cnt) < 90)
                THEN 1 ELSE 0 END AS at_risk
    FROM enr e
    LEFT JOIN student_overall so ON so.student_id = e.student_id
    LEFT JOIN att a ON a.student_id = e.student_id AND a.class_id = e.class_id
  )
  SELECT c.id, c.name, COUNT(*)::int, COUNT(ps.overall_pct)::int,
         ROUND(AVG(ps.overall_pct)::numeric, 2),
         CASE WHEN SUM(ps.total_cnt) > 0 THEN ROUND(100.0*SUM(ps.present_cnt)/SUM(ps.total_cnt), 2) END,
         ROUND(100.0 * COUNT(*) FILTER (WHERE ps.overall_pct >= 60) / NULLIF(COUNT(ps.overall_pct),0), 2),
         SUM(ps.at_risk)::int
  FROM per_student ps JOIN cls c ON c.id = ps.class_id
  GROUP BY c.id, c.name
  ORDER BY c.name;
END; $$;
GRANT EXECUTE ON FUNCTION public.perf_classes(TEXT, DATE, DATE) TO authenticated;


CREATE OR REPLACE FUNCTION public.perf_class_students(
  p_class_id UUID,
  p_start    DATE DEFAULT NULL,
  p_end      DATE DEFAULT NULL
)
RETURNS TABLE (
  student_id UUID, student_name TEXT,
  academic_average NUMERIC, attendance_rate NUMERIC,
  present INT, absent INT, late INT, excused INT,
  performing_well BOOLEAN, at_risk BOOLEAN, attendance_concern BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_school UUID := public.auth_school_id();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id = p_class_id AND school_id = v_school) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH enr AS (
    SELECT sc.student_id, p.first_name, p.last_name
    FROM student_classes sc JOIN profiles p ON p.id = sc.student_id
    WHERE sc.class_id = p_class_id
  ),
  row_pct AS (
    SELECT g.student_id, g.score / NULLIF(g.max_score,0) * 100.0 AS pct
    FROM grades g
    WHERE g.school_id = v_school
      AND g.student_id IN (SELECT student_id FROM enr)
      AND (p_start IS NULL OR g.created_at >= p_start)
      AND (p_end   IS NULL OR g.created_at <  p_end)
  ),
  student_overall AS (SELECT student_id, AVG(pct) AS overall_pct FROM row_pct GROUP BY student_id),
  att AS (
    SELECT a.student_id,
           COUNT(*) FILTER (WHERE a.status = 'present') AS present_cnt,
           COUNT(*) FILTER (WHERE a.status = 'absent')  AS absent_cnt,
           COUNT(*) FILTER (WHERE a.status = 'late')    AS late_cnt,
           COUNT(*) FILTER (WHERE a.status = 'excused') AS excused_cnt
    FROM attendance a
    WHERE a.class_id = p_class_id
      AND (p_start IS NULL OR a.date >= p_start)
      AND (p_end   IS NULL OR a.date <  p_end)
    GROUP BY a.student_id
  )
  SELECT e.student_id,
         trim(e.first_name || ' ' || e.last_name),
         ROUND(so.overall_pct::numeric, 2),
         CASE WHEN COALESCE(at.present_cnt+at.absent_cnt+at.late_cnt+at.excused_cnt,0) > 0
              THEN ROUND(100.0*(COALESCE(at.present_cnt,0)+COALESCE(at.late_cnt,0))
                         / (at.present_cnt+at.absent_cnt+at.late_cnt+at.excused_cnt), 2) END,
         COALESCE(at.present_cnt,0)::int, COALESCE(at.absent_cnt,0)::int,
         COALESCE(at.late_cnt,0)::int,    COALESCE(at.excused_cnt,0)::int,
         (so.overall_pct IS NOT NULL AND so.overall_pct >= 80),
         (so.overall_pct IS NOT NULL AND so.overall_pct < 60),
         (
           (COALESCE(at.present_cnt+at.absent_cnt+at.late_cnt+at.excused_cnt,0) > 0
            AND (100.0*(COALESCE(at.present_cnt,0)+COALESCE(at.late_cnt,0))
                 / (at.present_cnt+at.absent_cnt+at.late_cnt+at.excused_cnt)) < 90)
           OR COALESCE(at.absent_cnt,0) >= 3
         )
  FROM enr e
  LEFT JOIN student_overall so ON so.student_id = e.student_id
  LEFT JOIN att at ON at.student_id = e.student_id
  ORDER BY trim(e.first_name || ' ' || e.last_name);
END; $$;
GRANT EXECUTE ON FUNCTION public.perf_class_students(UUID, DATE, DATE) TO authenticated;
