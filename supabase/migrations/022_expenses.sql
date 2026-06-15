-- ─────────────────────────────────────────────────────────────────────
-- Migration 022: Generic operating-expense ledger
--
-- Adds an `expenses` table for the non-payroll cost categories surfaced
-- under the new "Expenses" sidebar dropdown (Facilities, Utilities,
-- Academic Materials, Technology, Transportation, Food Services,
-- Security, Administration, Marketing, Events, Insurance, Capital
-- Expenses). Payroll keeps its own table — it has employee-specific
-- columns that don't fit a single ledger.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'facilities', 'utilities', 'academic_materials', 'technology',
    'transportation', 'food_services', 'security', 'administration',
    'marketing', 'events', 'insurance', 'capital_expenses'
  )),
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  vendor TEXT,
  paid_at DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('paid', 'pending', 'overdue')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_school_category
  ON public.expenses(school_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_at
  ON public.expenses(paid_at);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read school expenses" ON public.expenses;
CREATE POLICY "Admins read school expenses" ON public.expenses
  FOR SELECT USING (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins insert school expenses" ON public.expenses;
CREATE POLICY "Admins insert school expenses" ON public.expenses
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins update school expenses" ON public.expenses;
CREATE POLICY "Admins update school expenses" ON public.expenses
  FOR UPDATE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  ) WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins delete school expenses" ON public.expenses;
CREATE POLICY "Admins delete school expenses" ON public.expenses
  FOR DELETE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  );
