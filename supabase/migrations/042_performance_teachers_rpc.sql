-- ═══════════════════════════════════════════════════════════════════
-- 042 · Attendance & Performance — Teaching Overview RPC
-- ───────────────────────────────────────────────────────────────────
-- Per-teacher performance, derived from the classes/subjects they teach
-- (class_subjects.teacher_id) and their students' marks in those subjects:
--   • academic_average = flat mean of mark %s in the teacher's (class,
--     subject) assignments — how the teacher's students do in the
--     teacher's subject(s).
--   • attendance_rate  = house standard over the teacher's distinct classes.
--   • pass_rate        = % of the teacher's subject-marks at/above 60.
--   • students/classes/subjects counts, and at_risk = students whose average
--     in the teacher's subject(s) is below 60.
-- SECURITY DEFINER, scoped to auth_school_id(), admin-only. Optional date
-- range buckets grades by created_at and attendance by date.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.perf_teachers(
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS TABLE (
  teacher_id UUID, teacher_name TEXT,
  classes INT, subjects INT, students INT,
  academic_average NUMERIC, attendance_rate NUMERIC, pass_rate NUMERIC, at_risk INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_school UUID := public.auth_school_id();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  WITH assign AS (
    SELECT cs.teacher_id, cs.class_id, cs.subject_id
    FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
    WHERE c.school_id = v_school AND cs.teacher_id IS NOT NULL
  ),
  tclass AS (SELECT DISTINCT teacher_id, class_id FROM assign),
  tsubj  AS (SELECT DISTINCT teacher_id, subject_id FROM assign),
  -- marks in each teacher's own subject(s)
  marks AS (
    SELECT a.teacher_id, g.student_id, g.score / NULLIF(g.max_score,0) * 100.0 AS pct
    FROM grades g
    JOIN assign a ON a.class_id = g.class_id AND a.subject_id = g.subject_id
    WHERE g.school_id = v_school
      AND (p_start IS NULL OR g.created_at >= p_start)
      AND (p_end   IS NULL OR g.created_at <  p_end)
  ),
  ts AS (SELECT teacher_id, student_id, AVG(pct) AS savg FROM marks GROUP BY teacher_id, student_id),
  tstud AS (
    SELECT DISTINCT a.teacher_id, sc.student_id
    FROM assign a JOIN student_classes sc ON sc.class_id = a.class_id
  ),
  tatt AS (
    SELECT tc.teacher_id,
           COUNT(*) FILTER (WHERE att.status IN ('present','late')) AS present_cnt,
           COUNT(*) AS total_cnt
    FROM tclass tc JOIN attendance att ON att.class_id = tc.class_id
    WHERE (p_start IS NULL OR att.date >= p_start)
      AND (p_end   IS NULL OR att.date <  p_end)
    GROUP BY tc.teacher_id
  ),
  agg_marks AS (
    SELECT teacher_id,
           ROUND(AVG(pct)::numeric, 2) AS academic_average,
           ROUND(100.0 * COUNT(*) FILTER (WHERE pct >= 60) / NULLIF(COUNT(*),0), 2) AS pass_rate
    FROM marks GROUP BY teacher_id
  ),
  agg_class AS (SELECT teacher_id, COUNT(*) AS n FROM tclass GROUP BY teacher_id),
  agg_subj  AS (SELECT teacher_id, COUNT(*) AS n FROM tsubj  GROUP BY teacher_id),
  agg_stud  AS (SELECT teacher_id, COUNT(*) AS n FROM tstud  GROUP BY teacher_id),
  agg_risk  AS (SELECT teacher_id, COUNT(*) FILTER (WHERE savg < 60) AS n FROM ts GROUP BY teacher_id)
  SELECT p.id,
         trim(p.first_name || ' ' || p.last_name),
         COALESCE(ac.n, 0)::int,
         COALESCE(asu.n, 0)::int,
         COALESCE(ast.n, 0)::int,
         am.academic_average,
         CASE WHEN ta.total_cnt > 0 THEN ROUND(100.0*ta.present_cnt/ta.total_cnt, 2) END,
         am.pass_rate,
         COALESCE(ar.n, 0)::int
  FROM profiles p
  JOIN (SELECT DISTINCT teacher_id FROM assign) ta0 ON ta0.teacher_id = p.id
  LEFT JOIN agg_class ac  ON ac.teacher_id  = p.id
  LEFT JOIN agg_subj  asu ON asu.teacher_id = p.id
  LEFT JOIN agg_stud  ast ON ast.teacher_id = p.id
  LEFT JOIN agg_marks am  ON am.teacher_id  = p.id
  LEFT JOIN agg_risk  ar  ON ar.teacher_id  = p.id
  LEFT JOIN tatt      ta  ON ta.teacher_id  = p.id
  WHERE p.school_id = v_school AND p.role = 'teacher'
  ORDER BY trim(p.first_name || ' ' || p.last_name);
END; $$;
GRANT EXECUTE ON FUNCTION public.perf_teachers(DATE, DATE) TO authenticated;
