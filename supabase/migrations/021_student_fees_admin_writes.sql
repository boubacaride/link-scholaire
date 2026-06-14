-- ─────────────────────────────────────────────────────────────────────
-- Migration 021: Allow school/platform admins to write student_fees
--
-- 001_initial_schema.sql enabled RLS on `student_fees` and shipped a
-- SELECT policy, but never granted INSERT / UPDATE / DELETE. That meant
-- the admin "Record payment" UI in the Student Fees page failed with a
-- row-level security error.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert student fees" ON public.student_fees;
CREATE POLICY "Admins can insert student fees" ON public.student_fees
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update student fees" ON public.student_fees;
CREATE POLICY "Admins can update student fees" ON public.student_fees
  FOR UPDATE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  ) WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete student fees" ON public.student_fees;
CREATE POLICY "Admins can delete student fees" ON public.student_fees
  FOR DELETE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  );
