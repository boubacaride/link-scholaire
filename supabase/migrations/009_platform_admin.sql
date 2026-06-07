-- === PLATFORM ADMIN: school onboarding & subscription authorization ===
-- Establishes the top of the hierarchy:
--   platform_admin  ──creates──▶ school + subscription + school_admin
--   school_admin    ──(once subscription is active)──▶ teachers/students/parents
--
-- Conventions mirror migrations 001-008.

-- ─── Helper: is the current user a platform admin? ───────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  );
$$;

-- ─── SCHOOLS: platform admin sees & manages every school ─────────────
DROP POLICY IF EXISTS "Users can view their school" ON public.schools;
CREATE POLICY "Users can view their school" ON public.schools
  FOR SELECT USING (id = public.auth_school_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin can insert schools" ON public.schools;
CREATE POLICY "Platform admin can insert schools" ON public.schools
  FOR INSERT WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin can update schools" ON public.schools;
CREATE POLICY "Platform admin can update schools" ON public.schools
  FOR UPDATE USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin can delete schools" ON public.schools;
CREATE POLICY "Platform admin can delete schools" ON public.schools
  FOR DELETE USING (public.is_platform_admin());

-- ─── PROFILES: platform admin can read profiles across all schools ───
-- (so the platform dashboard can show school admins everywhere)
DROP POLICY IF EXISTS "Platform admin can view all profiles" ON public.profiles;
CREATE POLICY "Platform admin can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_platform_admin());

-- ─── RPC: onboard a school together with its first school admin ──────
-- Platform-admin only. Creates the school, then provisions a school_admin
-- auth user + identity + profile bound to that new school, atomically.
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

  -- 1) Create the school
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

  -- 2) Create the school admin auth user
  v_new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    role, aud, confirmation_token, is_super_admin
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_admin_email)),
    crypt(p_admin_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_admin_first, 'last_name', p_admin_last),
    NOW(), NOW(), 'authenticated', 'authenticated', '', FALSE
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

  -- 3) Create the school admin profile bound to the new school
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

-- ─── Gate: school admins can only add users once the subscription is
-- active. Platform admins are exempt. This refreshes the function from
-- migration 005, adding the subscription check. ─────────────────────
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

  -- Subscription authorization gate for school admins
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
    role, aud, confirmation_token, is_super_admin
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name),
    NOW(), NOW(), 'authenticated', 'authenticated', '', FALSE
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

-- ─── Provision a ready-to-use platform admin account ─────────────────
-- Idempotent: only creates the org school + platform admin if absent.
-- Credentials:  platform@schoolflow.app  /  Platform123!
DO $$
DECLARE
  v_org_school_id UUID;
  v_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'platform@schoolflow.app') THEN
    -- A home school is required (profiles.school_id is NOT NULL). Platform
    -- privileges come from the role, not this school.
    SELECT id INTO v_org_school_id FROM public.schools WHERE name = 'SchoolFlow Platform' LIMIT 1;
    IF v_org_school_id IS NULL THEN
      INSERT INTO public.schools (name, type, subscription_status, subscription_plan, max_students, max_teachers)
      VALUES ('SchoolFlow Platform', 'private', 'active', 'platform', 0, 0)
      RETURNING id INTO v_org_school_id;
    END IF;

    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      role, aud, confirmation_token, is_super_admin
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'platform@schoolflow.app',
      crypt('Platform123!', gen_salt('bf')),
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('first_name', 'Platform', 'last_name', 'Admin'),
      NOW(), NOW(), 'authenticated', 'authenticated', '', FALSE
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, 'platform@schoolflow.app',
      jsonb_build_object('sub', v_user_id::text, 'email', 'platform@schoolflow.app'),
      'email', NOW(), NOW(), NOW()
    );

    INSERT INTO public.profiles (user_id, school_id, role, first_name, last_name, email, is_active)
    VALUES (v_user_id, v_org_school_id, 'platform_admin', 'Platform', 'Admin', 'platform@schoolflow.app', TRUE);
  END IF;
END $$;
