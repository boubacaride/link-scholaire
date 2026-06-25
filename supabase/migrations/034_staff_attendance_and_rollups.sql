-- ═══════════════════════════════════════════════════════════════════
-- 034 · staff_attendance table + aggregation RPCs for the dashboards
-- ───────────────────────────────────────────────────────────────────
-- Powers Tasks 6 + 7:
--
--   Task 6 — replace the dummy AttendanceChart inline array with a
--   real 5-weekday rollup. RPC: attendance_last5_weekdays().
--
--   Task 7 — admin school-wide oversight dashboard:
--     • New table staff_attendance(staff_id, role, date, status,
--       recorded_by) for teacher / employee absence tracking.
--     • RPCs:
--       - attendance_school_day(day)  → per-grade + whole-school %
--       - attendance_class_status(day) → live "which classes have
--         submitted" board
--       - staff_attendance_day(day)   → per-role staff %
--
-- All RPCs are SECURITY DEFINER but each one filters by the caller's
-- school via auth_school_id(), so a school admin can't see another
-- school's numbers. Only admins are allowed to call the staff one.
-- ═══════════════════════════════════════════════════════════════════


-- ─── Staff attendance table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  /** Snapshot the role at recording-time so a later role change
   *  doesn't reshape historic rollups. */
  role         TEXT NOT NULL CHECK (role IN ('teacher', 'employee', 'school_admin')),
  date         DATE NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note         TEXT,
  recorded_by  UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_school_date
  ON public.staff_attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_role_date
  ON public.staff_attendance(school_id, role, date);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- Visibility: admins only. Staff attendance is sensitive HR data —
-- a teacher should not see whether their colleague was marked absent.
CREATE POLICY "Admins read staff attendance" ON public.staff_attendance
  FOR SELECT USING (
    school_id = public.auth_school_id() AND public.is_admin()
  );

CREATE POLICY "Admins write staff attendance" ON public.staff_attendance
  FOR ALL USING (
    school_id = public.auth_school_id() AND public.is_admin()
  )
  WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
    AND recorded_by = public.auth_profile_id()
  );


-- ─── RPC: last-5-weekdays school-wide attendance (Task 6) ────────
-- Powers the AttendanceChart widget on the admin / teacher home.
-- Returns one row per weekday for the most recent 5 weekdays ending
-- today, with present + absent counts.
DROP FUNCTION IF EXISTS public.attendance_last5_weekdays();
CREATE OR REPLACE FUNCTION public.attendance_last5_weekdays()
RETURNS TABLE(
  day_iso  DATE,
  weekday  TEXT,
  present  INT,
  absent   INT,
  late     INT,
  excused  INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL THEN
    RETURN;                       -- not signed in → empty set
  END IF;
  RETURN QUERY
  WITH days AS (
    -- Walk back from today, keep the 5 most recent weekdays (Mon-Fri).
    SELECT d::date AS day_iso
      FROM generate_series(
        (CURRENT_DATE - INTERVAL '20 days')::date,
        CURRENT_DATE,
        '1 day'
      ) d
     WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
     ORDER BY d DESC
     LIMIT 5
  ),
  agg AS (
    SELECT a.date,
           SUM((a.status = 'present')::int)::int AS present,
           SUM((a.status = 'absent') ::int)::int AS absent,
           SUM((a.status = 'late')   ::int)::int AS late,
           SUM((a.status = 'excused')::int)::int AS excused
      FROM public.attendance a
     WHERE a.school_id = v_school
       AND a.date IN (SELECT day_iso FROM days)
     GROUP BY a.date
  )
  SELECT d.day_iso,
         to_char(d.day_iso, 'Dy') AS weekday,
         COALESCE(agg.present, 0),
         COALESCE(agg.absent,  0),
         COALESCE(agg.late,    0),
         COALESCE(agg.excused, 0)
    FROM days d
    LEFT JOIN agg ON agg.date = d.day_iso
   ORDER BY d.day_iso ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_last5_weekdays() TO authenticated;


-- ─── RPC: per-grade + whole-school student attendance (Task 7) ──
-- For a given day, returns one row per grade level with the count
-- of absent students and the total enrolled. The "whole school"
-- numbers are computed client-side by summing.
DROP FUNCTION IF EXISTS public.attendance_school_day(DATE);
CREATE OR REPLACE FUNCTION public.attendance_school_day(p_day DATE)
RETURNS TABLE(
  grade        INT,
  enrolled     INT,
  absent       INT,
  late         INT,
  excused      INT,
  present      INT,
  recorded     INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.is_admin() THEN
    RETURN;                       -- admin-only data
  END IF;

  RETURN QUERY
  WITH enrollment AS (
    -- Distinct (student, grade) — a student counts once per grade.
    SELECT DISTINCT sc.student_id, c.grade
      FROM public.student_classes sc
      JOIN public.classes c ON c.id = sc.class_id
     WHERE c.school_id = v_school
  ),
  marks AS (
    SELECT a.student_id, a.status, c.grade
      FROM public.attendance a
      JOIN public.classes  c ON c.id = a.class_id
     WHERE a.school_id = v_school
       AND a.date = p_day
  ),
  -- For "absent today" semantics, a student counts as absent / late /
  -- excused if ANY of their marked attendance rows for the day shows
  -- that status. Otherwise present if they appear at all.
  per_student AS (
    SELECT student_id, grade,
           bool_or(status = 'absent')  AS was_absent,
           bool_or(status = 'late')    AS was_late,
           bool_or(status = 'excused') AS was_excused,
           bool_or(status = 'present') AS was_present
      FROM marks
     GROUP BY student_id, grade
  )
  SELECT e.grade,
         COUNT(DISTINCT e.student_id)::int AS enrolled,
         COALESCE(SUM(CASE WHEN ps.was_absent  THEN 1 ELSE 0 END), 0)::int AS absent,
         COALESCE(SUM(CASE WHEN ps.was_late    THEN 1 ELSE 0 END), 0)::int AS late,
         COALESCE(SUM(CASE WHEN ps.was_excused THEN 1 ELSE 0 END), 0)::int AS excused,
         COALESCE(SUM(CASE WHEN ps.was_present THEN 1 ELSE 0 END), 0)::int AS present,
         COUNT(DISTINCT ps.student_id)::int AS recorded
    FROM enrollment e
    LEFT JOIN per_student ps ON ps.student_id = e.student_id
   GROUP BY e.grade
   ORDER BY e.grade;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_school_day(DATE) TO authenticated;


-- ─── RPC: per-class live submission status (Task 7 live board) ──
-- For a given day, returns one row per class with whether attendance
-- has been submitted, the count of absent / late / excused students,
-- and a CSV of absent students' names for the feed.
DROP FUNCTION IF EXISTS public.attendance_class_status(DATE);
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
         (agg.marked_rows IS NOT NULL),                     -- submitted?
         COALESCE(agg.absent,  0),
         COALESCE(agg.late,    0),
         COALESCE(agg.excused, 0),
         COALESCE(agg.absent_names, '')
    FROM classes_in_school c
    LEFT JOIN enrolled e ON e.class_id = c.id
    LEFT JOIN agg     a2 ON a2.class_id = c.id
    LEFT JOIN agg     agg ON agg.class_id = c.id
   ORDER BY c.grade, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_class_status(DATE) TO authenticated;


-- ─── RPC: staff attendance per-role rollup (Task 7) ──────────────
DROP FUNCTION IF EXISTS public.staff_attendance_day(DATE);
CREATE OR REPLACE FUNCTION public.staff_attendance_day(p_day DATE)
RETURNS TABLE(
  role           TEXT,
  total_active   INT,
  absent         INT,
  late           INT,
  excused        INT,
  present        INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := public.auth_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.is_admin() THEN
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
           SUM((sa.status = 'absent') ::int)::int AS absent,
           SUM((sa.status = 'late')   ::int)::int AS late,
           SUM((sa.status = 'excused')::int)::int AS excused,
           SUM((sa.status = 'present')::int)::int AS present
      FROM public.staff_attendance sa
     WHERE sa.school_id = v_school
       AND sa.date = p_day
       AND sa.role IN ('teacher', 'employee')
     GROUP BY sa.role
  )
  SELECT r.r,
         COALESCE(t.n,       0),
         COALESCE(m.absent,  0),
         COALESCE(m.late,    0),
         COALESCE(m.excused, 0),
         COALESCE(m.present, 0)
    FROM roles r
    LEFT JOIN totals t ON t.r = r.r
    LEFT JOIN marks  m ON m.role = r.r
   ORDER BY r.r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_attendance_day(DATE) TO authenticated;
