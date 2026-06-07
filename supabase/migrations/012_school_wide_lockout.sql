-- === SCHOOL-WIDE LOCKOUT ===
-- When a platform admin suspends a school's admin account, the WHOLE school is
-- locked out (teachers, students, parents) — not just the admin. Reactivating
-- restores access for everyone.
--
-- Implemented with a school-level flag checked at login, rather than bulk-
-- editing every profile, so individual is_active states are preserved and
-- reactivation is clean.

-- ─── Flag on the school ──────────────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS access_suspended BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── get_user_context(): reject users of a suspended school ──────────
-- Platform admins are never locked out. Everyone else in a suspended school
-- is refused a session (mirrors the existing is_active behaviour).
CREATE OR REPLACE FUNCTION public.get_user_context()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT p.*, s.name as school_name, s.type as school_type, s.access_suspended
  INTO v_profile
  FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.user_id = auth.uid()
  AND p.is_active = TRUE
  LIMIT 1;

  IF v_profile IS NULL THEN
    RETURN json_build_object('error', 'No active profile found');
  END IF;

  IF v_profile.access_suspended = TRUE AND v_profile.role <> 'platform_admin' THEN
    RETURN json_build_object('error', 'School access suspended');
  END IF;

  RETURN json_build_object(
    'profile_id', v_profile.id,
    'user_id', v_profile.user_id,
    'school_id', v_profile.school_id,
    'school_name', v_profile.school_name,
    'school_type', v_profile.school_type,
    'role', v_profile.role,
    'first_name', v_profile.first_name,
    'last_name', v_profile.last_name,
    'email', v_profile.email,
    'avatar_url', v_profile.avatar_url
  );
END;
$$;

-- ─── update_school_admin(): cascade suspend/reactivate to the school ──
-- Refreshes the function from migration 010, adding the school-wide lockout:
-- toggling the admin's active state also flips schools.access_suspended.
CREATE OR REPLACE FUNCTION public.update_school_admin(
  p_profile_id UUID,
  p_first TEXT DEFAULT NULL,
  p_last TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_user_id UUID;
  v_target_role TEXT;
  v_target_school_id UUID;
  v_new_email TEXT;
BEGIN
  SELECT role::text INTO v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN
    RETURN json_build_object('error', 'Only platform admins can manage school admins');
  END IF;

  SELECT user_id, role::text, school_id
  INTO v_target_user_id, v_target_role, v_target_school_id
  FROM public.profiles WHERE id = p_profile_id;

  IF v_target_user_id IS NULL THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;

  IF v_target_role <> 'school_admin' THEN
    RETURN json_build_object('error', 'This account is not a school administrator');
  END IF;

  UPDATE public.profiles
  SET first_name = COALESCE(p_first, first_name),
      last_name  = COALESCE(p_last, last_name),
      email      = COALESCE(lower(trim(p_email)), email),
      is_active  = COALESCE(p_is_active, is_active),
      updated_at = NOW()
  WHERE id = p_profile_id;

  -- School-wide lockout: suspending the admin locks the whole school;
  -- reactivating unlocks it.
  IF p_is_active IS NOT NULL THEN
    UPDATE public.schools
    SET access_suspended = NOT p_is_active, updated_at = NOW()
    WHERE id = v_target_school_id;
  END IF;

  IF p_first IS NOT NULL OR p_last IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'first_name', COALESCE(p_first, raw_user_meta_data->>'first_name'),
             'last_name',  COALESCE(p_last, raw_user_meta_data->>'last_name')
           ),
        updated_at = NOW()
    WHERE id = v_target_user_id;
  END IF;

  IF p_email IS NOT NULL AND lower(trim(p_email)) <> '' THEN
    v_new_email := lower(trim(p_email));
    UPDATE auth.users SET email = v_new_email, updated_at = NOW() WHERE id = v_target_user_id;
    UPDATE auth.identities
    SET provider_id = v_new_email,
        identity_data = jsonb_build_object('sub', v_target_user_id::text, 'email', v_new_email),
        updated_at = NOW()
    WHERE user_id = v_target_user_id AND provider = 'email';
  END IF;

  IF p_password IS NOT NULL AND length(p_password) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = NOW()
    WHERE id = v_target_user_id;
  ELSIF p_password IS NOT NULL AND length(p_password) > 0 THEN
    RETURN json_build_object('error', 'Password must be at least 6 characters');
  END IF;

  RETURN json_build_object('success', TRUE, 'profile_id', p_profile_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'That email is already in use');
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;
