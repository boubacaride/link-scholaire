-- ═══════════════════════════════════════════════════════════════════
-- 049 · Fix "Database error querying schema" for newly-created users
-- ───────────────────────────────────────────────────────────────────
-- Migration 014 backfilled EIGHT auth.users token columns to '' on
-- existing rows, but the create_user_with_profile and
-- create_school_with_admin RPCs only set FOUR of them in their INSERTs
-- (confirmation_token, recovery_token, email_change_token_new,
-- email_change). The other four — email_change_token_current,
-- phone_change, phone_change_token, reauthentication_token — are left
-- NULL on every account created AFTER 014. GoTrue scans those columns
-- into Go strings at login and fails on NULL with
-- "Database error querying schema".
--
-- Symptom: the platform admin (backfilled by 014) signs in fine, but a
-- school_admin / teacher / student created later cannot.
--
-- This migration: (1) re-backfills any NULL token columns, and
-- (2) recreates both RPCs so they set ALL eight token columns to ''.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) Backfill any rows created since migration 014 ────────────────
DO $$
DECLARE c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'confirmation_token','recovery_token','email_change_token_new','email_change',
    'email_change_token_current','phone_change','phone_change_token','reauthentication_token'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = c
    ) THEN
      EXECUTE format('UPDATE auth.users SET %I = '''' WHERE %I IS NULL', c, c);
    END IF;
  END LOOP;
END $$;

-- ─── 2a) create_user_with_profile — set ALL token columns ────────────
CREATE OR REPLACE FUNCTION public.create_user_with_profile(
  p_email TEXT,
  p_password TEXT,
  p_role TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_school_id UUID;
  v_caller_role TEXT;
  v_sub_status TEXT;
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
    SELECT subscription_status INTO v_sub_status
    FROM public.schools WHERE id = v_caller_school_id;
    IF v_sub_status IS DISTINCT FROM 'active' THEN
      RETURN json_build_object('error',
        'Your school subscription is not active yet. Please contact the platform administrator to authorize it before adding users.');
    END IF;
  END IF;

  v_new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    role, aud, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name),
    NOW(), NOW(), 'authenticated', 'authenticated', FALSE,
    '', '', '', '',
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_user_id,
    lower(trim(p_email)),
    jsonb_build_object('sub', v_new_user_id::text, 'email', lower(trim(p_email))),
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO public.profiles (
    user_id, school_id, role, first_name, last_name, email, phone, address, is_active
  ) VALUES (
    v_new_user_id, v_caller_school_id, p_role,
    p_first_name, p_last_name, lower(trim(p_email)), p_phone, p_address, TRUE
  )
  RETURNING id INTO v_new_profile_id;

  RETURN json_build_object('success', TRUE, 'user_id', v_new_user_id, 'profile_id', v_new_profile_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'A user with this email already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;

-- ─── 2b) create_school_with_admin — set ALL token columns ────────────
CREATE OR REPLACE FUNCTION public.create_school_with_admin(
  p_school_name TEXT,
  p_school_type TEXT,
  p_plan TEXT,
  p_max_students INT,
  p_max_teachers INT,
  p_subscription_status TEXT,
  p_admin_email TEXT,
  p_admin_password TEXT,
  p_admin_first TEXT,
  p_admin_last TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_school_id UUID;
  v_new_user_id UUID;
  v_new_profile_id UUID;
BEGIN
  SELECT role::text INTO v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN
    RETURN json_build_object('error', 'Only platform admins can onboard schools');
  END IF;

  IF p_school_type NOT IN ('public', 'private') THEN
    RETURN json_build_object('error', 'School type must be public or private');
  END IF;

  IF COALESCE(p_subscription_status, 'trial') NOT IN ('active', 'trial', 'expired', 'cancelled') THEN
    RETURN json_build_object('error', 'Invalid subscription status');
  END IF;

  INSERT INTO public.schools (name, type, subscription_status, subscription_plan, max_students, max_teachers)
  VALUES (
    trim(p_school_name),
    p_school_type,
    COALESCE(p_subscription_status, 'trial'),
    NULLIF(trim(p_plan), ''),
    COALESCE(p_max_students, 500),
    COALESCE(p_max_teachers, 50)
  )
  RETURNING id INTO v_school_id;

  v_new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    role, aud, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_admin_email)),
    crypt(p_admin_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_admin_first, 'last_name', p_admin_last),
    NOW(), NOW(), 'authenticated', 'authenticated', FALSE,
    '', '', '', '',
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_user_id,
    lower(trim(p_admin_email)),
    jsonb_build_object('sub', v_new_user_id::text, 'email', lower(trim(p_admin_email))),
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO public.profiles (user_id, school_id, role, first_name, last_name, email, is_active)
  VALUES (
    v_new_user_id, v_school_id, 'school_admin',
    p_admin_first, p_admin_last, lower(trim(p_admin_email)), TRUE
  )
  RETURNING id INTO v_new_profile_id;

  RETURN json_build_object(
    'success', TRUE,
    'school_id', v_school_id,
    'admin_user_id', v_new_user_id,
    'admin_profile_id', v_new_profile_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'A user with this email already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;
