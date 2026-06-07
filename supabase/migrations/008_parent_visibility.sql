-- === PARENT VISIBILITY ===
-- Parents need read-only insight into their own children's academic records.
-- The original policies (migration 003) only exposed grades/submissions to the
-- student themselves, the recording teacher, or admins. This migration adds a
-- linked-parent path so a parent can VIEW (never edit) their child's grades and
-- submissions. Attendance and published content are already school-scoped and
-- therefore visible to parents.

-- Helper: is the current user a linked parent of this student? Bypasses RLS so
-- it can be used safely inside policies without recursion.
CREATE OR REPLACE FUNCTION public.is_parent_of(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_students
    WHERE parent_id = public.auth_profile_id()
      AND student_id = p_student_id
  );
$$;

-- GRADES: add the linked-parent read path.
DROP POLICY IF EXISTS "Users can view relevant grades" ON public.grades;
CREATE POLICY "Users can view relevant grades" ON public.grades
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR recorded_by = public.auth_profile_id()
    OR public.is_parent_of(student_id)
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

-- SUBMISSIONS: add the linked-parent read path (so parents can see what's
-- turned in / still missing).
DROP POLICY IF EXISTS "Users can view relevant submissions" ON public.submissions;
CREATE POLICY "Users can view relevant submissions" ON public.submissions
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR content_id IN (SELECT id FROM public.content WHERE teacher_id = public.auth_profile_id())
    OR public.is_parent_of(student_id)
    OR public.is_admin()
  );
