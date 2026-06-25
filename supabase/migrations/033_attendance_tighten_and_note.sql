-- ═══════════════════════════════════════════════════════════════════
-- 033 · Attendance — tighten RLS to "teacher of that class", add note
-- ───────────────────────────────────────────────────────────────────
-- Two improvements ahead of Task 5 (Teacher Attendance UI):
--
--   1. Add an optional `note` column so teachers can attach a brief
--      per-student remark when marking absent / late.
--   2. Replace the broad INSERT / UPDATE policies (which let any
--      teacher in the school write attendance for any class) with
--      policies that require the teacher to actually teach the class.
--      Admins keep their wider write access for corrections.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Note column ─────────────────────────────────────────────────
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN public.attendance.note IS
  'Optional teacher comment attached to a single student''s
   attendance for the day. Surfaces in the admin oversight dashboard.';


-- ─── Tighten INSERT / UPDATE policies ────────────────────────────
DROP POLICY IF EXISTS "Teachers can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance" ON public.attendance;

CREATE POLICY "Teachers can insert attendance for own classes" ON public.attendance
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND (
      public.is_admin()
      OR (
        public.auth_role() = 'teacher'
        AND class_id IN (
          SELECT class_id FROM public.class_subjects
           WHERE teacher_id = public.auth_profile_id()
        )
      )
    )
    AND recorded_by = public.auth_profile_id()
  );

CREATE POLICY "Teachers can update attendance for own classes" ON public.attendance
  FOR UPDATE USING (
    school_id = public.auth_school_id()
    AND (
      public.is_admin()
      OR (
        public.auth_role() = 'teacher'
        AND class_id IN (
          SELECT class_id FROM public.class_subjects
           WHERE teacher_id = public.auth_profile_id()
        )
      )
    )
  );
