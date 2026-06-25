-- ═══════════════════════════════════════════════════════════════════
-- 036 · Attendance RPCs — resolve OUT-parameter / column collision
-- ───────────────────────────────────────────────────────────────────
-- Migration 035's range RPCs declare RETURNS TABLE(grade INT, ...).
-- Inside the body the CTEs also produce a column named `grade`, and
-- PL/pgSQL's default conflict resolution makes the bare identifier
-- ambiguous → runtime error:
--   "column reference 'grade' is ambiguous"
--
-- Two ways to fix this: rename the OUT params, or tell PL/pgSQL that
-- bare identifiers should resolve to SQL columns. The second is one
-- line per function and doesn't change the public signature, so the
-- TypeScript client keeps working unchanged.
--
-- Same fix applied to the role / staff_attendance_range pair for
-- symmetry, even though `role` is less likely to collide.
-- ═══════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.attendance_school_range(p_start DATE, p_end DATE)
RETURNS TABLE(
  grade                     INT,
  enrolled                  INT,
  absent_instances          INT,
  distinct_students_absent  INT,
  late_instances            INT,
  excused_instances         INT,
  present_instances         INT,
  recorded_instances        INT,
  days_with_data            INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.is_admin() THEN
    RETURN;
  END IF;
  IF p_end < p_start THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH enrollment AS (
    SELECT DISTINCT sc.student_id, c.grade
      FROM public.student_classes sc
      JOIN public.classes c ON c.id = sc.class_id
     WHERE c.school_id = v_school
  ),
  marks AS (
    SELECT a.student_id, a.status, a.date, c.grade
      FROM public.attendance a
      JOIN public.classes  c ON c.id = a.class_id
     WHERE a.school_id = v_school
       AND a.date BETWEEN p_start AND p_end
  ),
  per_grade AS (
    SELECT e.grade,
           COUNT(DISTINCT e.student_id)::int AS enrolled
      FROM enrollment e
     GROUP BY e.grade
  ),
  per_grade_marks AS (
    SELECT m.grade,
           SUM((m.status = 'absent') ::int)::int AS absent_instances,
           SUM((m.status = 'late')   ::int)::int AS late_instances,
           SUM((m.status = 'excused')::int)::int AS excused_instances,
           SUM((m.status = 'present')::int)::int AS present_instances,
           COUNT(*)::int                          AS recorded_instances,
           COUNT(DISTINCT m.date)::int            AS days_with_data,
           COUNT(DISTINCT
             CASE WHEN m.status = 'absent' THEN m.student_id END
           )::int                                AS distinct_students_absent
      FROM marks m
     GROUP BY m.grade
  )
  SELECT pg.grade,
         pg.enrolled,
         COALESCE(pgm.absent_instances,         0),
         COALESCE(pgm.distinct_students_absent, 0),
         COALESCE(pgm.late_instances,           0),
         COALESCE(pgm.excused_instances,        0),
         COALESCE(pgm.present_instances,        0),
         COALESCE(pgm.recorded_instances,       0),
         COALESCE(pgm.days_with_data,           0)
    FROM per_grade pg
    LEFT JOIN per_grade_marks pgm ON pgm.grade = pg.grade
   ORDER BY pg.grade;
END;
$$;


CREATE OR REPLACE FUNCTION public.attendance_class_status(p_day DATE)
RETURNS TABLE(
  class_id        UUID,
  class_name      TEXT,
  grade           INT,
  enrolled        INT,
  submitted       BOOLEAN,
  absent          INT,
  late            INT,
  excused         INT,
  absent_names    TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.is_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH classes_in_school AS (
    SELECT id, name, grade
      FROM public.classes
     WHERE school_id = v_school
  ),
  enrolled AS (
    SELECT class_id, COUNT(DISTINCT student_id)::int AS n
      FROM public.student_classes
     WHERE class_id IN (SELECT id FROM classes_in_school)
     GROUP BY class_id
  ),
  marks AS (
    SELECT a.class_id, a.student_id, a.status,
           (p.first_name || ' ' || p.last_name) AS full_name
      FROM public.attendance a
      JOIN public.profiles  p ON p.id = a.student_id
     WHERE a.school_id = v_school
       AND a.date = p_day
  ),
  agg AS (
    SELECT m.class_id,
           SUM((m.status = 'absent') ::int)::int  AS absent,
           SUM((m.status = 'late')   ::int)::int  AS late,
           SUM((m.status = 'excused')::int)::int  AS excused,
           string_agg(CASE WHEN m.status = 'absent' THEN m.full_name END, ', ')
             AS absent_names,
           COUNT(*)::int AS marked_rows
      FROM marks m
     GROUP BY m.class_id
  )
  SELECT c.id,
         c.name,
         c.grade,
         COALESCE(e.n, 0),
         (agg.marked_rows IS NOT NULL),
         COALESCE(agg.absent,  0),
         COALESCE(agg.late,    0),
         COALESCE(agg.excused, 0),
         COALESCE(agg.absent_names, '')
    FROM classes_in_school c
    LEFT JOIN enrolled e   ON e.class_id   = c.id
    LEFT JOIN agg      agg ON agg.class_id = c.id
   ORDER BY c.grade, c.name;
END;
$$;


CREATE OR REPLACE FUNCTION public.staff_attendance_range(p_start DATE, p_end DATE)
RETURNS TABLE(
  role                       TEXT,
  total_active               INT,
  absent_instances           INT,
  distinct_staff_absent      INT,
  late_instances             INT,
  excused_instances          INT,
  present_instances          INT,
  days_with_data             INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.is_admin() THEN
    RETURN;
  END IF;
  IF p_end < p_start THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH roles AS (
    SELECT unnest(ARRAY['teacher', 'employee']) AS r
  ),
  totals AS (
    SELECT p.role::text AS r, COUNT(*)::int AS n
      FROM public.profiles p
     WHERE p.school_id = v_school
       AND p.role IN ('teacher', 'employee')
       AND p.is_active = TRUE
     GROUP BY p.role
  ),
  marks AS (
    SELECT sa.role,
           SUM((sa.status = 'absent') ::int)::int AS absent_instances,
           SUM((sa.status = 'late')   ::int)::int AS late_instances,
           SUM((sa.status = 'excused')::int)::int AS excused_instances,
           SUM((sa.status = 'present')::int)::int AS present_instances,
           COUNT(DISTINCT
             CASE WHEN sa.status = 'absent' THEN sa.staff_id END
           )::int                                  AS distinct_staff_absent,
           COUNT(DISTINCT sa.date)::int            AS days_with_data
      FROM public.staff_attendance sa
     WHERE sa.school_id = v_school
       AND sa.date BETWEEN p_start AND p_end
       AND sa.role IN ('teacher', 'employee')
     GROUP BY sa.role
  )
  SELECT r.r,
         COALESCE(t.n, 0),
         COALESCE(m.absent_instances,        0),
         COALESCE(m.distinct_staff_absent,   0),
         COALESCE(m.late_instances,          0),
         COALESCE(m.excused_instances,       0),
         COALESCE(m.present_instances,       0),
         COALESCE(m.days_with_data,          0)
    FROM roles r
    LEFT JOIN totals t ON t.r    = r.r
    LEFT JOIN marks  m ON m.role = r.r
   ORDER BY r.r;
END;
$$;


CREATE OR REPLACE FUNCTION public.attendance_class_submission_by_grade(p_day DATE)
RETURNS TABLE(
  grade           INT,
  total_classes   INT,
  submitted       INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.is_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH classes_in_school AS (
    SELECT id, grade FROM public.classes WHERE school_id = v_school
  ),
  submissions AS (
    SELECT DISTINCT class_id
      FROM public.attendance
     WHERE school_id = v_school
       AND date = p_day
  )
  SELECT c.grade,
         COUNT(*)::int AS total_classes,
         COUNT(*) FILTER (WHERE s.class_id IS NOT NULL)::int AS submitted
    FROM classes_in_school c
    LEFT JOIN submissions s ON s.class_id = c.id
   GROUP BY c.grade
   ORDER BY c.grade;
END;
$$;
