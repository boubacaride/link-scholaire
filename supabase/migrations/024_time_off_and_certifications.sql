-- ─────────────────────────────────────────────────────────────────────
-- Migration 024: Time-off requests + certification requests
--
-- Adds the data model for the time-off / certification approval suite:
--
--   time_off_requests       — one row per request. `requester_kind`
--                             discriminates STAFF (teacher/employee) from
--                             STUDENT requests so each routes to the
--                             correct admin approval dashboard.
--   certification_requests  — staff-only professional certification /
--                             training requests.
--
-- Routing:
--   requester_kind = 'staff'   → admin "Staff approvals" dashboard
--   requester_kind = 'student' → admin "Student approvals" dashboard
--
-- `subject_id` is whose absence it is:
--   • staff self-request      → subject_id = requester_id
--   • university student       → subject_id = requester_id (kind 'student')
--   • parent for their child   → subject_id = child, requester_id = parent
--
-- RLS mirrors the rest of the schema: SECURITY DEFINER helper functions
-- (auth_school_id / auth_profile_id / is_admin / is_parent_of) avoid the
-- recursion that plain profile subqueries would cause.
-- ─────────────────────────────────────────────────────────────────────

-- ── TIME-OFF REQUESTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_off_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_kind TEXT NOT NULL CHECK (requester_kind IN ('staff', 'student')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT time_off_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_time_off_school_kind_status
  ON public.time_off_requests(school_id, requester_kind, status);
CREATE INDEX IF NOT EXISTS idx_time_off_requester
  ON public.time_off_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_time_off_dates
  ON public.time_off_requests(school_id, start_date, end_date);

ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: the requester, the subject (e.g. a student whose parent filed),
-- a linked parent of the subject, and same-school admins.
DROP POLICY IF EXISTS "View relevant time-off" ON public.time_off_requests;
CREATE POLICY "View relevant time-off" ON public.time_off_requests
  FOR SELECT USING (
    requester_id = public.auth_profile_id()
    OR subject_id = public.auth_profile_id()
    OR public.is_parent_of(subject_id)
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

-- INSERT: a user files for themselves, or a parent files for their child.
-- requester_id must always be the caller; the row must stay in-school.
DROP POLICY IF EXISTS "Create own time-off" ON public.time_off_requests;
CREATE POLICY "Create own time-off" ON public.time_off_requests
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND requester_id = public.auth_profile_id()
    AND status = 'pending'
    AND (
      subject_id = public.auth_profile_id()
      OR public.is_parent_of(subject_id)
    )
  );

-- UPDATE: only same-school admins (approve / reject / annotate).
DROP POLICY IF EXISTS "Admins review time-off" ON public.time_off_requests;
CREATE POLICY "Admins review time-off" ON public.time_off_requests
  FOR UPDATE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  ) WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

-- DELETE: the requester may withdraw a still-pending request; admins any.
DROP POLICY IF EXISTS "Withdraw or admin-delete time-off" ON public.time_off_requests;
CREATE POLICY "Withdraw or admin-delete time-off" ON public.time_off_requests
  FOR DELETE USING (
    (requester_id = public.auth_profile_id() AND status = 'pending')
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

-- ── CERTIFICATION REQUESTS (staff only) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.certification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  certification_name TEXT NOT NULL,
  issuing_org TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cert_dates_valid CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_cert_school_status
  ON public.certification_requests(school_id, status);
CREATE INDEX IF NOT EXISTS idx_cert_requester
  ON public.certification_requests(requester_id);

ALTER TABLE public.certification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View relevant certifications" ON public.certification_requests;
CREATE POLICY "View relevant certifications" ON public.certification_requests
  FOR SELECT USING (
    requester_id = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

DROP POLICY IF EXISTS "Create own certifications" ON public.certification_requests;
CREATE POLICY "Create own certifications" ON public.certification_requests
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND requester_id = public.auth_profile_id()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Admins review certifications" ON public.certification_requests;
CREATE POLICY "Admins review certifications" ON public.certification_requests
  FOR UPDATE USING (
    school_id = public.auth_school_id() AND public.is_admin()
  ) WITH CHECK (
    school_id = public.auth_school_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "Withdraw or admin-delete certifications" ON public.certification_requests;
CREATE POLICY "Withdraw or admin-delete certifications" ON public.certification_requests
  FOR DELETE USING (
    (requester_id = public.auth_profile_id() AND status = 'pending')
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );
