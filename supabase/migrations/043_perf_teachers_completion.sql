-- ═══════════════════════════════════════════════════════════════════
-- 043 · Teaching Overview — add assignment/exam completion rate
-- ───────────────────────────────────────────────────────────────────
-- Extends perf_teachers with completion_rate so the teacher performance
-- score can use the 70/20/10 (academic / attendance / completion) blend.
--   completion_rate = submitted / expected over the teacher's PUBLISHED
--   submittable content (type assignment | classwork). expected = students
--   enrolled in the content's class; submitted = submission rows whose
--   status is anything other than 'pending'. NULL when the teacher has no
--   such content (the score helper then re-weights over what exists).
-- Return shape changes, so the function is dropped and recreated.
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.perf_teachers(DATE, DATE);

CREATE OR REPLACE FUNCTION public.perf_teachers(
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS TABLE (
  teacher_id UUID, teacher_name TEXT,
  classes INT, subjects INT, students INT,
  academic_average NUMERIC, attendance_rate NUMERIC, pass_rate NUMERIC,
  completion_rate NUMERIC, at_risk INT
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
  -- Completion: per published submittable content, expected vs submitted.
  comp_content AS (
    SELECT c.teacher_id, c.id AS content_id, c.class_id
    FROM content c
    WHERE c.school_id = v_school AND c.teacher_id IS NOT NULL
      AND c.type IN ('assignment','classwork') AND c.is_published
      AND (p_start IS NULL OR c.created_at >= p_start)
      AND (p_end   IS NULL OR c.created_at <  p_end)
  ),
  comp_expected AS (
    SELECT cc.teacher_id, cc.content_id, COUNT(sc.student_id) AS expected
    FROM comp_content cc JOIN student_classes sc ON sc.class_id = cc.class_id
    GROUP BY cc.teacher_id, cc.content_id
  ),
  comp_submitted AS (
    SELECT cc.content_id, COUNT(s.id) AS submitted
    FROM comp_content cc
    LEFT JOIN submissions s ON s.content_id = cc.content_id AND s.status <> 'pending'
    GROUP BY cc.content_id
  ),
  agg_comp AS (
    SELECT e.teacher_id,
           CASE WHEN SUM(e.expected) > 0
                THEN ROUND(100.0 * SUM(COALESCE(sub.submitted,0)) / SUM(e.expected), 2) END AS completion_rate
    FROM comp_expected e
    LEFT JOIN comp_submitted sub ON sub.content_id = e.content_id
    GROUP BY e.teacher_id
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
         acmp.completion_rate,
         COALESCE(ar.n, 0)::int
  FROM profiles p
  JOIN (SELECT DISTINCT teacher_id FROM assign) ta0 ON ta0.teacher_id = p.id
  LEFT JOIN agg_class ac  ON ac.teacher_id  = p.id
  LEFT JOIN agg_subj  asu ON asu.teacher_id = p.id
  LEFT JOIN agg_stud  ast ON ast.teacher_id = p.id
  LEFT JOIN agg_marks am  ON am.teacher_id  = p.id
  LEFT JOIN agg_risk  ar  ON ar.teacher_id  = p.id
  LEFT JOIN agg_comp  acmp ON acmp.teacher_id = p.id
  LEFT JOIN tatt      ta  ON ta.teacher_id  = p.id
  WHERE p.school_id = v_school AND p.role = 'teacher'
  ORDER BY trim(p.first_name || ' ' || p.last_name);
END; $$;
GRANT EXECUTE ON FUNCTION public.perf_teachers(DATE, DATE) TO authenticated;
