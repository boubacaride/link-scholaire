-- 018_ensure_parent_visibility.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SYMPTOM: A parent dashboard shows a child's assignments as "Missing work"
-- while the student's own dashboard shows the very same work as submitted, and
-- the child's grades appear blank on the parent view.
--
-- ROOT CAUSE: `student_classes` and `content` are school-scoped, so a parent can
-- read the assignment list. But `grades` and `submissions` are only readable by
-- a parent through the `is_parent_of(student_id)` path introduced in migration
-- 008. When 008 hasn't actually been applied to the database, the parent reads
-- ZERO submissions/grades for the child -> every past-due assignment is counted
-- as "missing" and grades render empty, even though the student turned the work
-- in. (The student reads their OWN rows via `student_id = auth_profile_id()`,
-- so their view is correct — hence the mismatch.)
--
-- This migration is a safe, IDEMPOTENT re-application of the parent read paths
-- (008) plus the teacher grade-status UPDATE path (017). Running it once
-- guarantees parents can see their children's grades & submissions regardless of
-- whether 008/017 were previously applied. It does not weaken any other policy.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: is the current user a linked parent of this student? SECURITY DEFINER
-- so it bypasses RLS and can be used inside policies without recursion.
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

-- GRADES: student, recording teacher, linked parent, or same-school admin.
DROP POLICY IF EXISTS "Users can view relevant grades" ON public.grades;
CREATE POLICY "Users can view relevant grades" ON public.grades
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR recorded_by = public.auth_profile_id()
    OR public.is_parent_of(student_id)
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

-- SUBMISSIONS: student, owning teacher, linked parent, or admin. This is the
-- path that lets a parent see what is turned in vs. still missing.
DROP POLICY IF EXISTS "Users can view relevant submissions" ON public.submissions;
CREATE POLICY "Users can view relevant submissions" ON public.submissions
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR content_id IN (SELECT id FROM public.content WHERE teacher_id = public.auth_profile_id())
    OR public.is_parent_of(student_id)
    OR public.is_admin()
  );

-- SUBMISSIONS (grading): let the owning teacher / admin flip a submission to
-- 'graded' when posting a grade (re-asserts migration 017). Without this the
-- grade still posts to the gradebook, but the submission status never advances.
DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.submissions;
CREATE POLICY "Teachers can grade submissions" ON public.submissions
  FOR UPDATE USING (
    content_id IN (SELECT id FROM public.content WHERE teacher_id = public.auth_profile_id())
    OR public.is_admin()
  );
