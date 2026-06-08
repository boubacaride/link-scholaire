-- 017_submission_grading.sql
-- Lets a teacher mark a student's submission as graded.
--
-- Grading is driven entirely from the app (SubmissionsGrader): the grade is
-- posted to the gradebook via the existing "Teachers can insert grades" policy,
-- and the submission is flipped to 'graded' via the policy below. No new RPC or
-- columns are required — this single policy is the only DB change needed.
--
-- Before this migration, submissions only had a student UPDATE policy (003),
-- so a teacher's attempt to mark work graded was silently blocked by RLS.

DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.submissions;
CREATE POLICY "Teachers can grade submissions" ON public.submissions
  FOR UPDATE USING (
    content_id IN (SELECT id FROM public.content WHERE teacher_id = public.auth_profile_id())
    OR public.is_admin()
  );
