-- ═══════════════════════════════════════════════════════════════════
-- 027 · Report Card module — academic years, terms, components, ranks
-- ───────────────────────────────────────────────────────────────────
-- This migration adds the structured tables the Report Card generator
-- needs. The school's existing free-text `grades.term` and
-- `grades.academic_year` fields stay in place — the new tables sit
-- alongside them and are matched on name when computing a card.
--
-- Tables introduced
--   • academic_years      — one row per school year
--   • terms               — grading periods (Q1/Q2/…) with is_locked
--   • grade_components    — per-class-subject weights (Quiz/Test/Exam)
--   • subject_remarks     — teacher comment per (student, subject, term)
--   • report_cards        — one row per (student, term) once generated
-- Column additions
--   • class_subjects.coefficient — numeric, defaults to 1
-- ═══════════════════════════════════════════════════════════════════


-- ─── ACADEMIC YEARS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                                    -- e.g. "2025-2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_academic_years_school ON public.academic_years(school_id);


-- ─── TERMS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                                    -- e.g. "Trimestre 1" / "Q1"
  sequence SMALLINT NOT NULL DEFAULT 1,                  -- ordering inside the year
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,              -- when true, grades are frozen
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(academic_year_id, name)
);
CREATE INDEX IF NOT EXISTS idx_terms_year ON public.terms(academic_year_id);


-- ─── CLASS_SUBJECTS · coefficient column ──────────────────────────
ALTER TABLE public.class_subjects
  ADD COLUMN IF NOT EXISTS coefficient NUMERIC(5,2) NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.class_subjects.coefficient IS
  'Weight applied to the subject average when computing the overall (moyenne générale) for a class.';


-- ─── GRADE COMPONENTS ─────────────────────────────────────────────
-- Optional per-(class, subject) breakdown into weighted components
-- like Quiz/Test/Exam. When no components are defined for a subject,
-- the calculator falls back to equal weighting across whatever grades
-- exist for the term.
CREATE TABLE IF NOT EXISTS public.grade_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_subject_id UUID NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                                    -- "Quiz" / "Test" / "Exam"
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grade_components_class_subject
  ON public.grade_components(class_subject_id);


-- ─── SUBJECT REMARKS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subject_remarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_subject_id UUID NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  remark TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, class_subject_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_subject_remarks_student
  ON public.subject_remarks(student_id, term_id);


-- ─── REPORT CARDS ─────────────────────────────────────────────────
-- One row per (student, term). Re-running the generator UPSERTs so
-- the table never accumulates duplicate cards.
CREATE TABLE IF NOT EXISTS public.report_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  overall_average NUMERIC(6,2),
  rank SMALLINT,
  class_size SMALLINT,
  mention TEXT,                                          -- e.g. "Bien" or "A"
  decision TEXT,                                         -- "Promoted" | "Retained" | "Conditional"
  principal_remark TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  pdf_document_id UUID REFERENCES public.student_documents(id) ON DELETE SET NULL,
  generated_by UUID REFERENCES public.profiles(id),
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON public.report_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_class_term ON public.report_cards(class_id, term_id);


-- ─── RLS ──────────────────────────────────────────────────────────

ALTER TABLE public.academic_years   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_remarks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards     ENABLE ROW LEVEL SECURITY;

-- academic_years: everyone in the school reads; admins write.
DROP POLICY IF EXISTS "Academic years readable in school" ON public.academic_years;
CREATE POLICY "Academic years readable in school" ON public.academic_years
  FOR SELECT USING (school_id = public.auth_school_id());

DROP POLICY IF EXISTS "Admins write academic years" ON public.academic_years;
CREATE POLICY "Admins write academic years" ON public.academic_years
  FOR ALL USING (school_id = public.auth_school_id() AND public.is_admin())
  WITH CHECK (school_id = public.auth_school_id() AND public.is_admin());

-- terms: same shape — read for the school, write for admins. Joined to
-- the year for the school check.
DROP POLICY IF EXISTS "Terms readable in school" ON public.terms;
CREATE POLICY "Terms readable in school" ON public.terms
  FOR SELECT USING (
    academic_year_id IN (
      SELECT id FROM public.academic_years WHERE school_id = public.auth_school_id()
    )
  );

DROP POLICY IF EXISTS "Admins write terms" ON public.terms;
CREATE POLICY "Admins write terms" ON public.terms
  FOR ALL USING (
    public.is_admin()
    AND academic_year_id IN (
      SELECT id FROM public.academic_years WHERE school_id = public.auth_school_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    AND academic_year_id IN (
      SELECT id FROM public.academic_years WHERE school_id = public.auth_school_id()
    )
  );

-- grade_components: read for the school, write for the assigned teacher
-- of that class_subject or any admin.
DROP POLICY IF EXISTS "Components readable in school" ON public.grade_components;
CREATE POLICY "Components readable in school" ON public.grade_components
  FOR SELECT USING (
    class_subject_id IN (
      SELECT cs.id FROM public.class_subjects cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.school_id = public.auth_school_id()
    )
  );

DROP POLICY IF EXISTS "Teachers and admins write components" ON public.grade_components;
CREATE POLICY "Teachers and admins write components" ON public.grade_components
  FOR ALL USING (
    class_subject_id IN (
      SELECT cs.id FROM public.class_subjects cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.school_id = public.auth_school_id()
      AND (cs.teacher_id = public.auth_profile_id() OR public.is_admin())
    )
  )
  WITH CHECK (
    class_subject_id IN (
      SELECT cs.id FROM public.class_subjects cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.school_id = public.auth_school_id()
      AND (cs.teacher_id = public.auth_profile_id() OR public.is_admin())
    )
  );

-- subject_remarks: students/parents read their own; teacher of the class
-- and admins read+write.
DROP POLICY IF EXISTS "Read own / child / school remarks" ON public.subject_remarks;
CREATE POLICY "Read own / child / school remarks" ON public.subject_remarks
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR student_id IN (
      SELECT student_id FROM public.parent_students
      WHERE parent_id = public.auth_profile_id()
    )
    OR (public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
        AND class_subject_id IN (
          SELECT cs.id FROM public.class_subjects cs
          JOIN public.classes c ON c.id = cs.class_id
          WHERE c.school_id = public.auth_school_id()
        ))
  );

DROP POLICY IF EXISTS "Teachers and admins write remarks" ON public.subject_remarks;
CREATE POLICY "Teachers and admins write remarks" ON public.subject_remarks
  FOR ALL USING (
    public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND teacher_id = public.auth_profile_id()
    AND class_subject_id IN (
      SELECT cs.id FROM public.class_subjects cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.school_id = public.auth_school_id()
    )
  )
  WITH CHECK (
    public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND teacher_id = public.auth_profile_id()
    AND class_subject_id IN (
      SELECT cs.id FROM public.class_subjects cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.school_id = public.auth_school_id()
    )
  );

-- report_cards: student / parent read their own; teacher of that class
-- and admins read all; only teachers/admins write.
DROP POLICY IF EXISTS "Read own / child / class report cards" ON public.report_cards;
CREATE POLICY "Read own / child / class report cards" ON public.report_cards
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR student_id IN (
      SELECT student_id FROM public.parent_students
      WHERE parent_id = public.auth_profile_id()
    )
    OR (public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
        AND class_id IN (SELECT id FROM public.classes WHERE school_id = public.auth_school_id()))
  );

DROP POLICY IF EXISTS "Teachers and admins write report cards" ON public.report_cards;
CREATE POLICY "Teachers and admins write report cards" ON public.report_cards
  FOR ALL USING (
    public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND class_id IN (SELECT id FROM public.classes WHERE school_id = public.auth_school_id())
  )
  WITH CHECK (
    public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND class_id IN (SELECT id FROM public.classes WHERE school_id = public.auth_school_id())
  );


-- ─── GRADES · enforce locked-term rule via trigger ────────────────
-- Grades insert/update is rejected when the referenced term (matched
-- by name within the same academic year) is locked. This keeps the
-- existing free-text grade.term field but adds the lock workflow.
CREATE OR REPLACE FUNCTION public.block_grades_on_locked_term()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  SELECT t.is_locked INTO v_locked
  FROM public.terms t
  JOIN public.academic_years ay ON ay.id = t.academic_year_id
  WHERE t.name = NEW.term
    AND ay.name = NEW.academic_year
    AND ay.school_id = NEW.school_id
  LIMIT 1;
  IF v_locked THEN
    RAISE EXCEPTION 'Term "%" is locked — grades cannot be edited.', NEW.term;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grades_block_when_locked ON public.grades;
CREATE TRIGGER grades_block_when_locked
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.block_grades_on_locked_term();


-- ─── Backfill a default academic_year row from existing grades data ──
-- If the school has historical grades but no academic_years row yet,
-- create one matching the most-used `academic_year` text on grades so
-- the generator can attach to something. Safe to run repeatedly.
INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_active)
SELECT DISTINCT
  g.school_id,
  g.academic_year,
  '2025-09-01'::date,
  '2026-07-31'::date,
  TRUE
FROM public.grades g
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_years ay
  WHERE ay.school_id = g.school_id AND ay.name = g.academic_year
)
ON CONFLICT (school_id, name) DO NOTHING;
