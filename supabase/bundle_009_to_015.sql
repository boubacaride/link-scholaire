-- ═══════════════════════════════════════════════════════════════════
-- SchoolFlow — Platform Admin + Tenant Management bundle
-- Combines migrations 009 → 015 in order. Paste this whole file into the
-- Supabase SQL Editor and Run once. Safe to re-run (idempotent).
--
-- Provisions platform login:  platform@schoolflow.app  /  Platform123!
-- (Run 001–008 first if this is a fresh database.)
-- ═══════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 009_platform_admin.sql
-- ╚═══════════════════════════════════════════════════════════════════

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


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 010_school_admin_management.sql
-- ╚═══════════════════════════════════════════════════════════════════

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


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 011_delete_school_admin.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- === PLATFORM ADMIN: permanently delete a school admin account ===
-- Track 2 of access control (track 1 = suspend, migration 010). When a school
-- refuses to pay, the platform admin can permanently remove the admin login so
-- they can never sign in again.
--
-- Deleting auth.users cascades to public.profiles (profiles.user_id has
-- ON DELETE CASCADE) and to the auth identity. Before deleting we neutralise
-- the few profile references that DON'T cascade, so the delete always succeeds.

CREATE OR REPLACE FUNCTION public.delete_school_admin(
  p_profile_id UUID
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
BEGIN
  SELECT role::text INTO v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN
    RETURN json_build_object('error', 'Only platform admins can delete school admins');
  END IF;

  SELECT user_id, role::text INTO v_target_user_id, v_target_role
  FROM public.profiles WHERE id = p_profile_id;

  IF v_target_user_id IS NULL THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;

  IF v_target_role <> 'school_admin' THEN
    RETURN json_build_object('error', 'This account is not a school administrator');
  END IF;

  -- Neutralise non-cascading references to this profile so the delete can
  -- proceed cleanly. (A school admin normally has none of these, but seed
  -- data links announcements to the admin.)
  DELETE FROM public.announcements WHERE author_id = p_profile_id;
  UPDATE public.classes     SET supervisor_id = NULL WHERE supervisor_id = p_profile_id;
  UPDATE public.submissions SET graded_by     = NULL WHERE graded_by = p_profile_id;
  DELETE FROM public.class_subjects WHERE teacher_id = p_profile_id;
  DELETE FROM public.lessons        WHERE teacher_id = p_profile_id;
  DELETE FROM public.content        WHERE teacher_id = p_profile_id;  -- cascades its submissions
  DELETE FROM public.grades         WHERE recorded_by = p_profile_id;

  -- Remove the login. Cascades delete the profile, identity, messages, etc.
  DELETE FROM auth.users WHERE id = v_target_user_id;

  RETURN json_build_object('success', TRUE, 'deleted_profile_id', p_profile_id);

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 012_school_wide_lockout.sql
-- ╚═══════════════════════════════════════════════════════════════════

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


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 013_delete_school.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- === PLATFORM ADMIN: permanently delete an entire school ===
-- Removes a school and EVERY account/record tied to it (admins, teachers,
-- students, parents, classes, grades, content, fees, messages, ...).
-- Irreversible — intended for terminating a non-paying tenant outright.
--
-- Deleting the schools row cascades to all school-scoped tables (every
-- school_id FK is ON DELETE CASCADE, including profiles). Auth logins are not
-- cascaded by that, so we delete auth.users for the school's members too.

CREATE OR REPLACE FUNCTION public.delete_school(
  p_school_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_school_id UUID;
  v_user_ids UUID[];
  v_has_platform_admin BOOLEAN;
BEGIN
  SELECT role::text, school_id INTO v_caller_role, v_caller_school_id
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'platform_admin' THEN
    RETURN json_build_object('error', 'Only platform admins can delete schools');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN json_build_object('error', 'School not found');
  END IF;

  -- Safety: never delete the platform admin's own school / any platform school.
  IF p_school_id = v_caller_school_id THEN
    RETURN json_build_object('error', 'You cannot delete your own platform school');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE school_id = p_school_id AND role = 'platform_admin'
  ) INTO v_has_platform_admin;
  IF v_has_platform_admin THEN
    RETURN json_build_object('error', 'This school hosts a platform admin and cannot be deleted');
  END IF;

  -- Collect the member logins before the school (and its profiles) are gone.
  SELECT array_agg(user_id) INTO v_user_ids
  FROM public.profiles WHERE school_id = p_school_id;

  -- Cascade-delete all school data (classes, content, grades, profiles, ...).
  DELETE FROM public.schools WHERE id = p_school_id;

  -- Remove the orphaned auth logins (cascades their identities).
  IF v_user_ids IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;

  RETURN json_build_object('success', TRUE, 'deleted_accounts', COALESCE(array_length(v_user_ids, 1), 0));

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 014_fix_auth_tokens.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- === FIX: manually-created auth users cannot sign in ===
-- When you INSERT directly into auth.users, GoTrue (the auth server) later
-- scans several token columns into Go strings. If they are NULL it fails with
-- "Database error querying schema" and the user cannot log in — even with the
-- correct password. Migrations 004/005/009 only set confirmation_token,
-- leaving recovery_token / email_change* / phone_change* / reauthentication_token
-- NULL. This affects the platform admin AND every teacher/student/parent created
-- via create_user_with_profile, and every school admin via create_school_with_admin.
--
-- This migration: (1) backfills NULL token columns on existing rows, (2) hardens
-- the RPCs so new accounts are created correctly, (3) re-provisions the platform
-- admin if it is missing.

-- ─── 1) Backfill existing rows ───────────────────────────────────────
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

-- ─── 2a) Harden create_user_with_profile (keeps subscription gate) ───
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
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name),
    NOW(), NOW(), 'authenticated', 'authenticated', FALSE,
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

-- ─── 2b) Harden create_school_with_admin ─────────────────────────────
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
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_admin_email)),
    crypt(p_admin_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_admin_first, 'last_name', p_admin_last),
    NOW(), NOW(), 'authenticated', 'authenticated', FALSE,
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

-- ─── 3) Re-provision the platform admin if missing ───────────────────
-- (Idempotent.) Credentials: platform@schoolflow.app / Platform123!
DO $$
DECLARE
  v_org_school_id UUID;
  v_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'platform@schoolflow.app') THEN
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
      role, aud, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'platform@schoolflow.app',
      crypt('Platform123!', gen_salt('bf')),
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('first_name', 'Platform', 'last_name', 'Admin'),
      NOW(), NOW(), 'authenticated', 'authenticated', FALSE,
      '', '', '', ''
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


-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 015_platform_tenant_isolation.sql
-- ╚═══════════════════════════════════════════════════════════════════

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

-- Defensive: ensure the helper exists even if migration 009 has not been run
-- yet (so this migration can be applied standalone). Identical to 009.
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

DROP POLICY IF EXISTS "Platform admin can view all profiles" ON public.profiles;

CREATE POLICY "Platform admin can view school admins" ON public.profiles
  FOR SELECT USING (
    public.is_platform_admin() AND role = 'school_admin'
  );

