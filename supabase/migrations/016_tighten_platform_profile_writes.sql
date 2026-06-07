-- === TIGHTEN: platform admin write access to profiles ===
-- Migration 010 let the platform admin UPDATE any profile. Combined with the
-- tenant-isolation SELECT policy (015), it can't *see* teachers/students/parents
-- but could still *write* to them. The platform admin only ever edits/suspends
-- school_admins (always via the SECURITY DEFINER update_school_admin RPC, which
-- bypasses RLS anyway), so scope this direct-write policy to school_admin rows.

DROP POLICY IF EXISTS "Platform admin can update profiles" ON public.profiles;

CREATE POLICY "Platform admin can update school admins" ON public.profiles
  FOR UPDATE USING (
    public.is_platform_admin() AND role = 'school_admin'
  );
