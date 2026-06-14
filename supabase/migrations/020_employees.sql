-- ─────────────────────────────────────────────────────────────────────
-- Migration 020: Employees on profiles
--
-- Adds an `employee` role for non-teaching school staff (counsellors,
-- accountants, IT, janitors, drivers, etc.) plus structured columns for
-- their job classification and employment dates. Existing teachers,
-- school admins, students and parents are unaffected.
-- ─────────────────────────────────────────────────────────────────────

-- Widen the profiles.role CHECK to include 'employee'.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('platform_admin', 'school_admin', 'teacher', 'student', 'parent', 'employee'));

-- Employment metadata. All nullable so existing rows stay valid.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_category TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE;

-- Cheap index for the Employees list page (school + role).
CREATE INDEX IF NOT EXISTS idx_profiles_school_role
  ON public.profiles(school_id, role);
