-- ═══════════════════════════════════════════════════════════════════
-- 038 · Report-card comments — one editable teacher comment per
--       (student, academic year) for the classic report card.
-- ───────────────────────────────────────────────────────────────────
-- The US-style report card spans a whole academic year (two semesters),
-- so its free-text comment is keyed to (student, academic_year) rather
-- than a single term. Teachers/admins write it; the student and their
-- linked parents can read it. Re-saving UPSERTs on the unique pair.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.report_card_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  comment TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, academic_year_id)
);
CREATE INDEX IF NOT EXISTS idx_report_card_comments_student
  ON public.report_card_comments(student_id, academic_year_id);

ALTER TABLE public.report_card_comments ENABLE ROW LEVEL SECURITY;

-- Read: the student themselves, their linked parents, and any
-- teacher/admin within the same school.
DROP POLICY IF EXISTS "Read own/child/school report comments" ON public.report_card_comments;
CREATE POLICY "Read own/child/school report comments" ON public.report_card_comments
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR student_id IN (
      SELECT student_id FROM public.parent_students
      WHERE parent_id = public.auth_profile_id()
    )
    OR (public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
        AND school_id = public.auth_school_id())
  );

-- Write: teachers and admins within the same school.
DROP POLICY IF EXISTS "Teachers and admins write report comments" ON public.report_card_comments;
CREATE POLICY "Teachers and admins write report comments" ON public.report_card_comments
  FOR ALL USING (
    public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND school_id = public.auth_school_id()
  )
  WITH CHECK (
    public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND school_id = public.auth_school_id()
  );
