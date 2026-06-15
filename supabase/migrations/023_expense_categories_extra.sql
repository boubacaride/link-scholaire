-- ─────────────────────────────────────────────────────────────────────
-- Migration 023: Three more expense categories
--
-- Widens the expenses.category CHECK constraint with student_support,
-- sports_extracurricular and miscellaneous so the cascading sidebar
-- menu can drive the full list of buckets from a single source of truth.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check CHECK (category IN (
    'facilities', 'utilities', 'academic_materials', 'technology',
    'transportation', 'food_services', 'security', 'administration',
    'marketing', 'events', 'insurance', 'capital_expenses',
    'student_support', 'sports_extracurricular', 'miscellaneous'
  ));
