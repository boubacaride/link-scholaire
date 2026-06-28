-- ═══════════════════════════════════════════════════════════════════
-- 045 · Employee salary (reference only)
-- ───────────────────────────────────────────────────────────────────
-- Stores the agreed MONTHLY salary on the employee's profile, captured at
-- hiring on the Add Employee form. This is reference information ONLY — it
-- is NOT an expense and never touches the finance figures by itself.
--
-- A salary becomes an expense (and reduces the running bank balance on the
-- finance dashboard) only when an actual payment is recorded in `payroll`
-- with status = 'paid' — exactly as today. The employee's salary simply
-- pre-fills the Payroll form so paying is one fewer field to type.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2);

COMMENT ON COLUMN public.profiles.salary IS
  'Agreed monthly salary (reference only). Not an expense; only a paid payroll row is.';
