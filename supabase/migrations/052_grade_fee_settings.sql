-- ═══════════════════════════════════════════════════════════════════
-- 052 · Tuition fee per class (French system, CI → Terminale)
-- ───────────────────────────────────────────────────────────────────
-- Lets a school administrator set the annual fee for each grade level of
-- the francophone West-African system (13 classes: CI, CP, CE1, CE2, CM1,
-- CM2, Sixième, Cinquième, Quatrième, Troisième, Seconde, Première,
-- Terminale). One editable amount per (school, class).
--
-- New table with its own RLS, so no change to the platform-admin-only
-- schools UPDATE policy is needed: school admins manage their own rows.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grade_fee_settings (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_name TEXT NOT NULL,                         -- 'CI' … 'Terminale'
  amount     INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, grade_name)
);

CREATE INDEX IF NOT EXISTS idx_grade_fee_settings_school
  ON public.grade_fee_settings(school_id);

ALTER TABLE public.grade_fee_settings ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated member of the school (so the fees can be surfaced
-- to parents/staff later).
DROP POLICY IF EXISTS "read school grade fees" ON public.grade_fee_settings;
CREATE POLICY "read school grade fees" ON public.grade_fee_settings
  FOR SELECT USING (school_id = public.auth_school_id());

-- Write: administrators of the school only.
DROP POLICY IF EXISTS "admin writes grade fees" ON public.grade_fee_settings;
CREATE POLICY "admin writes grade fees" ON public.grade_fee_settings
  FOR ALL
  USING (public.is_admin() AND school_id = public.auth_school_id())
  WITH CHECK (public.is_admin() AND school_id = public.auth_school_id());
