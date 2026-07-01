-- ═══════════════════════════════════════════════════════════════════
-- 051 · Fix ambiguous create_user_with_profile overload
-- ───────────────────────────────────────────────────────────────────
-- Migration 030 replaced the original 7-arg create_user_with_profile with
-- a 10-arg version (adding date_of_birth / place_of_birth / gender) and
-- DROPPED the 7-arg one. Migration 049 (auth-token fix) then re-created the
-- 7-arg signature, so BOTH overloads existed again. PostgREST/Postgres can
-- no longer choose between them and every user creation fails with:
--   "Could not choose the best candidate function between:
--    public.create_user_with_profile(... 7 args ...),
--    public.create_user_with_profile(... 10 args ...)"
--
-- Fix: drop the stray 7-arg overload, and keep a single 10-arg function —
-- carrying BOTH the migration-030 behaviour (DOB/place/gender, subscription
-- gate, institutional-id trigger) AND the migration-049 token fix (all eight
-- auth.users token columns set to '' so new users can actually sign in).
-- ═══════════════════════════════════════════════════════════════════

-- Remove the ambiguous 7-arg overload re-introduced by migration 049.
DROP FUNCTION IF EXISTS public.create_user_with_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Canonical 10-arg version (replace in place).
CREATE OR REPLACE FUNCTION public.create_user_with_profile(
  p_email          TEXT,
  p_password       TEXT,
  p_role           TEXT,
  p_first_name     TEXT,
  p_last_name      TEXT,
  p_phone          TEXT DEFAULT NULL,
  p_address        TEXT DEFAULT NULL,
  p_date_of_birth  DATE DEFAULT NULL,
  p_place_of_birth TEXT DEFAULT NULL,
  p_gender         TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_school_id UUID;
  v_caller_role TEXT;
  v_school_status TEXT;
  v_new_user_id UUID;
  v_new_profile_id UUID;
BEGIN
  SELECT school_id, role::text INTO v_caller_school_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('school_admin', 'platform_admin') THEN
    RETURN json_build_object('error', 'Only admins can create users');
  END IF;
  IF v_caller_school_id IS NULL THEN
    RETURN json_build_object('error', 'Admin has no school assigned');
  END IF;

  IF v_caller_role = 'school_admin' THEN
    SELECT subscription_status INTO v_school_status
    FROM public.schools WHERE id = v_caller_school_id;
    IF v_school_status IS DISTINCT FROM 'active' THEN
      RETURN json_build_object('error', 'School subscription is not active');
    END IF;
  END IF;

  IF p_date_of_birth IS NOT NULL THEN
    IF p_date_of_birth > CURRENT_DATE THEN
      RETURN json_build_object('error', 'Date of birth cannot be in the future');
    END IF;
    IF p_date_of_birth < CURRENT_DATE - INTERVAL '120 years' THEN
      RETURN json_build_object('error', 'Date of birth is unrealistically old');
    END IF;
  END IF;

  v_new_user_id := gen_random_uuid();

  -- All eight token columns set to '' (NOT NULL) so GoTrue can scan them at
  -- login — see migration 049.
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    aud, role, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_new_user_id, '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)), crypt(p_password, gen_salt('bf')),
    NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('first_name', p_first_name, 'last_name', p_last_name)::jsonb,
    'authenticated', 'authenticated', NOW(), NOW(),
    '', '', '', '',
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_new_user_id, lower(trim(p_email)),
    json_build_object('sub', v_new_user_id::text, 'email', lower(trim(p_email)))::jsonb,
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO public.profiles (
    user_id, school_id, role,
    first_name, last_name, email, phone, address,
    date_of_birth, place_of_birth, gender, is_active
  ) VALUES (
    v_new_user_id, v_caller_school_id, p_role,
    p_first_name, p_last_name, lower(trim(p_email)), p_phone, p_address,
    p_date_of_birth, p_place_of_birth, p_gender, TRUE
  ) RETURNING id INTO v_new_profile_id;

  RETURN json_build_object(
    'user_id',    v_new_user_id,
    'profile_id', v_new_profile_id,
    'email',      lower(trim(p_email)),
    'role',       p_role
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'A user with this email already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_with_profile(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT
) TO authenticated;
