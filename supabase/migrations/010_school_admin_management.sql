-- === PLATFORM ADMIN: manage school admin accounts ===
-- Lets a platform admin edit and (de)activate a school's admin account —
-- e.g. suspend access when a school fails to pay. Suspending sets
-- profiles.is_active = FALSE; get_user_context() already requires
-- is_active = TRUE, so a suspended admin can no longer load a session.
--
-- Conventions mirror migrations 001-009.

-- ─── RLS: platform admin can update any profile (e.g. is_active) ─────
DROP POLICY IF EXISTS "Platform admin can update profiles" ON public.profiles;
CREATE POLICY "Platform admin can update profiles" ON public.profiles
  FOR UPDATE USING (public.is_platform_admin());

-- ─── RPC: edit / suspend a school admin account ─────────────────────
-- Platform-admin only. NULL params are left unchanged, so the same entry
-- point handles "suspend" (p_is_active => FALSE) and "edit profile".
-- Keeps public.profiles and auth.users (+ auth.identities) in sync.
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
  v_new_email TEXT;
BEGIN
  SELECT role::text INTO v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN
    RETURN json_build_object('error', 'Only platform admins can manage school admins');
  END IF;

  SELECT user_id, role::text INTO v_target_user_id, v_target_role
  FROM public.profiles WHERE id = p_profile_id;

  IF v_target_user_id IS NULL THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;

  IF v_target_role <> 'school_admin' THEN
    RETURN json_build_object('error', 'This account is not a school administrator');
  END IF;

  -- Update profile fields that were provided
  UPDATE public.profiles
  SET first_name = COALESCE(p_first, first_name),
      last_name  = COALESCE(p_last, last_name),
      email      = COALESCE(lower(trim(p_email)), email),
      is_active  = COALESCE(p_is_active, is_active),
      updated_at = NOW()
  WHERE id = p_profile_id;

  -- Mirror name changes into auth user metadata
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

  -- Email change: keep login (auth.users + identity) in sync
  IF p_email IS NOT NULL AND lower(trim(p_email)) <> '' THEN
    v_new_email := lower(trim(p_email));
    UPDATE auth.users SET email = v_new_email, updated_at = NOW() WHERE id = v_target_user_id;
    UPDATE auth.identities
    SET provider_id = v_new_email,
        identity_data = jsonb_build_object('sub', v_target_user_id::text, 'email', v_new_email),
        updated_at = NOW()
    WHERE user_id = v_target_user_id AND provider = 'email';
  END IF;

  -- Optional password reset
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
