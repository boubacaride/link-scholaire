-- ═══════════════════════════════════════════════════════════════════
-- 050 · Absence Excuse / Extended Absence Requests — FOUNDATION
-- ───────────────────────────────────────────────────────────────────
-- Parent/student-facing absence-excuse system (separate from, and NOT
-- touching, the staff time-off flow). This migration is the data layer:
--   • school-level gate (education_stage) + two policy settings
--   • absence_requests table + RLS (gated on education_stage, NOT grade)
--   • attendance.excuse_id link (additive, nullable)
--   • reconciliation RPCs (convert / revert, idempotent, caller-guarded)
--   • a forward-write lookup RPC (teachers can't read absence_requests)
--   • an admin settings RPC (school_admin can't UPDATE schools directly)
--
-- Adapted to the REAL schema (the Appendix A draft used placeholders):
--   • linkage table is parent_students(parent_id, student_id), not
--     parent_children
--   • roles are 'school_admin' / 'platform_admin', not 'admin'
--   • profiles link to auth via user_id = auth.uid(); the profile PK `id`
--     is what absence_requests.student_id / requested_by reference
--   • RLS reuses the recursion-safe SECURITY DEFINER helpers
--     auth_profile_id() / auth_school_id() / auth_role() / is_admin() /
--     is_parent_of()
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) School-level foundation: the gate + two settings ─────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS education_stage TEXT
    CHECK (education_stage IN ('k12', 'higher_ed')),
  ADD COLUMN IF NOT EXISTS require_approval_all_absences BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extended_absence_days INTEGER NOT NULL DEFAULT 3;

-- Backfill existing schools to 'k12' (documented default; correctable in
-- admin settings). New tenants set it explicitly at onboarding.
UPDATE public.schools SET education_stage = 'k12' WHERE education_stage IS NULL;

-- ─── 2) Absence requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.absence_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES public.profiles(id),  -- parent, or university student
  requester_role  TEXT NOT NULL CHECK (requester_role IN ('parent', 'student')),
  kind            TEXT NOT NULL CHECK (kind IN ('excuse', 'extended')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  reason_category TEXT NOT NULL,      -- medical, religious, family, bereavement, travel, other
  reason_note     TEXT,
  status          TEXT NOT NULL DEFAULT 'recorded'
                    CHECK (status IN ('recorded', 'pending', 'approved', 'denied', 'cancelled')),
  reviewed_by     UUID REFERENCES public.profiles(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT absence_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_absence_requests_student
  ON public.absence_requests (school_id, student_id, start_date);
CREATE INDEX IF NOT EXISTS idx_absence_requests_status
  ON public.absence_requests (school_id, status);

-- ─── 3) Link attendance rows to the excuse that converted them ───────
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS excuse_id UUID REFERENCES public.absence_requests(id);

-- ─── 4) RLS — gated on education_stage, split by command ─────────────
-- Parents/university students get INSERT + SELECT only (never UPDATE), so
-- they cannot self-approve. Only admins approve/deny (FOR ALL on own school).
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

-- Parent (k12): submit for, and read, their OWN linked child's requests.
DROP POLICY IF EXISTS "parent inserts k12 child absence requests" ON public.absence_requests;
CREATE POLICY "parent inserts k12 child absence requests"
  ON public.absence_requests FOR INSERT
  WITH CHECK (
    public.auth_role() = 'parent'
    AND requester_role = 'parent'
    AND requested_by = public.auth_profile_id()
    AND public.is_parent_of(student_id)
    AND school_id = public.auth_school_id()
    AND (SELECT education_stage FROM public.schools WHERE id = school_id) = 'k12'
  );

DROP POLICY IF EXISTS "parent reads k12 child absence requests" ON public.absence_requests;
CREATE POLICY "parent reads k12 child absence requests"
  ON public.absence_requests FOR SELECT
  USING (
    public.auth_role() = 'parent'
    AND public.is_parent_of(student_id)
    AND (SELECT education_stage FROM public.schools WHERE id = school_id) = 'k12'
  );

-- University student (higher_ed): submit for, and read, their OWN requests.
DROP POLICY IF EXISTS "university student inserts own absence requests" ON public.absence_requests;
CREATE POLICY "university student inserts own absence requests"
  ON public.absence_requests FOR INSERT
  WITH CHECK (
    public.auth_role() = 'student'
    AND requester_role = 'student'
    AND student_id = public.auth_profile_id()
    AND requested_by = public.auth_profile_id()
    AND school_id = public.auth_school_id()
    AND (SELECT education_stage FROM public.schools WHERE id = school_id) = 'higher_ed'
  );

DROP POLICY IF EXISTS "university student reads own absence requests" ON public.absence_requests;
CREATE POLICY "university student reads own absence requests"
  ON public.absence_requests FOR SELECT
  USING (
    public.auth_role() = 'student'
    AND student_id = public.auth_profile_id()
    AND (SELECT education_stage FROM public.schools WHERE id = school_id) = 'higher_ed'
  );

-- Admin: read + decide (approve/deny) for their OWN school.
DROP POLICY IF EXISTS "admin reviews school absence requests" ON public.absence_requests;
CREATE POLICY "admin reviews school absence requests"
  ON public.absence_requests FOR ALL
  USING (public.is_admin() AND school_id = public.auth_school_id())
  WITH CHECK (public.is_admin() AND school_id = public.auth_school_id());

-- ─── 5) Reconciliation RPC: convert covered absences -> excused ──────
-- Idempotent. Only converts EXISTING rows (never fabricates attendance,
-- which would inflate the denominator). Caller must be the requester or an
-- admin of the school.
CREATE OR REPLACE FUNCTION public.apply_absence_excuse(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID;
  v_school  UUID;
  v_start   DATE;
  v_end     DATE;
  v_status  TEXT;
  v_requested_by UUID;
  v_count   INTEGER;
BEGIN
  SELECT student_id, school_id, start_date, end_date, status, requested_by
    INTO v_student, v_school, v_start, v_end, v_status, v_requested_by
  FROM public.absence_requests WHERE id = p_request_id;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'absence_request % not found', p_request_id;
  END IF;

  -- Authorisation: the requester themselves, or an admin of that school.
  IF NOT (
    public.auth_profile_id() = v_requested_by
    OR (public.is_admin() AND public.auth_school_id() = v_school)
  ) THEN
    RAISE EXCEPTION 'not authorised to apply this excuse';
  END IF;

  -- Only EFFECTIVE excuses reconcile: short 'recorded', or extended 'approved'.
  IF v_status NOT IN ('recorded', 'approved') THEN
    RETURN 0;
  END IF;

  UPDATE public.attendance a
     SET status = 'excused',
         excuse_id = p_request_id
   WHERE a.student_id = v_student
     AND a.school_id  = v_school
     AND a.date >= v_start AND a.date <= v_end
     AND a.status IN ('absent', 'late')
     AND (a.excuse_id IS DISTINCT FROM p_request_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;   -- rows converted now; forward-write handles future absences
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_absence_excuse(UUID) TO authenticated;

-- ─── 6) Revert RPC: on cancellation/denial, undo this excuse ─────────
CREATE OR REPLACE FUNCTION public.revert_absence_excuse(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID;
  v_requested_by UUID;
  v_count INTEGER;
BEGIN
  SELECT school_id, requested_by INTO v_school, v_requested_by
  FROM public.absence_requests WHERE id = p_request_id;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'absence_request % not found', p_request_id;
  END IF;

  IF NOT (
    public.auth_profile_id() = v_requested_by
    OR (public.is_admin() AND public.auth_school_id() = v_school)
  ) THEN
    RAISE EXCEPTION 'not authorised to revert this excuse';
  END IF;

  UPDATE public.attendance a
     SET status = 'absent',
         excuse_id = NULL
   WHERE a.excuse_id = p_request_id
     AND a.status = 'excused';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revert_absence_excuse(UUID) TO authenticated;

-- ─── 7) Forward-write lookup: does an effective excuse cover a day? ──
-- The teacher attendance-write path calls this (teachers cannot SELECT
-- absence_requests under RLS) to decide whether a new absence should be
-- written as 'excused' + excuse_id. Returns the covering request id or NULL.
CREATE OR REPLACE FUNCTION public.find_effective_excuse(p_student_id UUID, p_date DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ar.id
  FROM public.absence_requests ar
  WHERE ar.student_id = p_student_id
    AND ar.school_id = public.auth_school_id()
    AND p_date >= ar.start_date AND p_date <= ar.end_date
    AND ar.status IN ('recorded', 'approved')
  ORDER BY ar.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_effective_excuse(UUID, DATE) TO authenticated;

-- ─── 8) Admin settings RPC (school_admin can't UPDATE schools directly) ─
-- Limits the editable surface to the three absence-policy columns on the
-- caller's OWN school. is_admin() = school_admin or platform_admin.
CREATE OR REPLACE FUNCTION public.update_school_absence_settings(
  p_education_stage TEXT,
  p_require_approval BOOLEAN,
  p_extended_days INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_school UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'Only admins can change school settings');
  END IF;
  IF p_education_stage IS NOT NULL AND p_education_stage NOT IN ('k12', 'higher_ed') THEN
    RETURN json_build_object('error', 'Invalid education stage');
  END IF;
  IF p_extended_days IS NULL OR p_extended_days < 1 THEN
    RETURN json_build_object('error', 'Extended-absence days must be at least 1');
  END IF;

  v_school := public.auth_school_id();
  UPDATE public.schools
     SET education_stage = COALESCE(p_education_stage, education_stage),
         require_approval_all_absences = COALESCE(p_require_approval, require_approval_all_absences),
         extended_absence_days = p_extended_days,
         updated_at = NOW()
   WHERE id = v_school;

  RETURN json_build_object('success', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_school_absence_settings(TEXT, BOOLEAN, INTEGER) TO authenticated;
