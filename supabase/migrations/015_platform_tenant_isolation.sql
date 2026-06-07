-- === TENANT ISOLATION FOR THE PLATFORM ADMIN ===
-- The platform admin operates the SaaS tenant layer: it manages schools and
-- their school_admins, and nothing else. It must NOT see a school's internal
-- members (teachers, students, parents) — each school is an independent tenant
-- run by its own school_admin.
--
-- Migration 009 granted the platform admin SELECT on ALL profiles, which leaked
-- every school's roster. This narrows that to school_admin rows only (needed for
-- the "Manage Admin" tools). The platform admin still sees all schools
-- (migration 009 schools policies) and its own profile (base school policy).

DROP POLICY IF EXISTS "Platform admin can view all profiles" ON public.profiles;

CREATE POLICY "Platform admin can view school admins" ON public.profiles
  FOR SELECT USING (
    public.is_platform_admin() AND role = 'school_admin'
  );
