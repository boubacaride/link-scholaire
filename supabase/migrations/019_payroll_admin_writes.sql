-- ─────────────────────────────────────────────────────────────────────
-- Migration 019: Allow school/platform admins to write payroll records
--
-- 001_initial_schema.sql enabled RLS on `payroll` and shipped a SELECT
-- policy, but never granted INSERT / UPDATE / DELETE. That meant a
-- school admin could see payroll rows but could not create or edit
-- them, breaking the "Add payroll record" flow in the dashboard.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can insert payroll" ON public.payroll;
CREATE POLICY "Admins can insert payroll" ON public.payroll
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update payroll" ON public.payroll;
CREATE POLICY "Admins can update payroll" ON public.payroll
  FOR UPDATE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  ) WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete payroll" ON public.payroll;
CREATE POLICY "Admins can delete payroll" ON public.payroll
  FOR DELETE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  );
