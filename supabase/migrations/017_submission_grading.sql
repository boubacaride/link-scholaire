-- 017_submission_grading.sql
-- Lets a teacher grade a student's submitted work and have that grade post to
-- the gradebook automatically. Each posted grade is linked back to the
-- submission it came from, so re-grading updates the same row (no duplicates).
-- Manual gradebook entries keep submission_id / content_id NULL as before.

-- ─── 1) Link grades to the submission / content they came from ────────────────
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content_id    UUID REFERENCES public.content(id)     ON DELETE SET NULL;

-- One gradebook row per submission (the upsert target below relies on this).
CREATE UNIQUE INDEX IF NOT EXISTS grades_submission_id_key
  ON public.grades(submission_id) WHERE submission_id IS NOT NULL;

-- ─── 2) Let the owning teacher (or an admin) update a submission to grade it ──
-- (The RPC below is SECURITY DEFINER and works regardless, but this keeps the
--  table's policies honest for any direct updates.)
DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.submissions;
CREATE POLICY "Teachers can grade submissions" ON public.submissions
  FOR UPDATE USING (
    content_id IN (SELECT id FROM public.content WHERE teacher_id = public.auth_profile_id())
    OR public.is_admin()
  );

-- ─── 3) Atomic grade: mark the submission graded AND post to the gradebook ────
CREATE OR REPLACE FUNCTION public.grade_submission(
  p_submission_id UUID,
  p_score         NUMERIC,
  p_max_score     NUMERIC DEFAULT NULL,
  p_feedback      TEXT    DEFAULT NULL,
  p_term          TEXT    DEFAULT 'Term 1',
  p_exam_type     TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub      public.submissions%ROWTYPE;
  v_content  public.content%ROWTYPE;
  v_caller   UUID := public.auth_profile_id();
  v_max      NUMERIC;
  v_grade_id UUID;
BEGIN
  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Submission not found');
  END IF;

  SELECT * INTO v_content FROM public.content WHERE id = v_sub.content_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Content not found');
  END IF;

  -- Authorisation: the content's own teacher, or any school/platform admin.
  IF NOT (v_content.teacher_id = v_caller OR public.is_admin()) THEN
    RETURN jsonb_build_object('error', 'Not authorized to grade this submission');
  END IF;

  v_max := COALESCE(NULLIF(p_max_score, 0), v_content.max_score, 100);

  -- Mark the submission graded (submissions.score is an integer column).
  UPDATE public.submissions
     SET status    = 'graded',
         score     = ROUND(p_score)::int,
         feedback  = p_feedback,
         graded_at = NOW(),
         graded_by = v_caller
   WHERE id = p_submission_id;

  -- Post / update the matching gradebook row, linked to this submission.
  INSERT INTO public.grades (
    school_id, student_id, class_id, subject_id,
    exam_type, score, max_score, term, recorded_by,
    submission_id, content_id
  ) VALUES (
    v_content.school_id, v_sub.student_id, v_content.class_id, v_content.subject_id,
    COALESCE(NULLIF(p_exam_type, ''), v_content.title, 'Assignment'),
    p_score, v_max,
    COALESCE(NULLIF(p_term, ''), 'Term 1'), v_caller,
    p_submission_id, v_content.id
  )
  ON CONFLICT (submission_id) WHERE submission_id IS NOT NULL
  DO UPDATE SET
    score       = EXCLUDED.score,
    max_score   = EXCLUDED.max_score,
    exam_type   = EXCLUDED.exam_type,
    term        = EXCLUDED.term,
    recorded_by = EXCLUDED.recorded_by
  RETURNING id INTO v_grade_id;

  RETURN jsonb_build_object('success', true, 'grade_id', v_grade_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grade_submission(UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
