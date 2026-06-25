-- ═══════════════════════════════════════════════════════════════════
-- 030 · Date-of-birth + place-of-birth on every profile
-- ───────────────────────────────────────────────────────────────────
-- Adds a `place_of_birth` column to profiles (DOB already exists on
-- the table from migration 001 but was silently dropped on insert
-- because create_user_with_profile didn't accept it).
--
-- Both columns stay NULLABLE so existing rows remain valid; the
-- registration forms enforce REQUIRED on new submissions.
--
-- The RPC `create_user_with_profile` is extended to accept the two
-- new params (plus also `gender`, which the forms already collect
-- but couldn't persist). Existing callers passing only the original
-- 7 params continue to work because every new param has a default.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Column ──────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS place_of_birth TEXT;

COMMENT ON COLUMN public.profiles.place_of_birth IS
  'Free-text birth city / town / region. Required on new student
   registrations; optional for staff. NULL on rows created before
   this migration.';


-- ─── RPC ─────────────────────────────────────────────────────────
-- Drop the old signature explicitly so we can change the function
-- arity (Postgres treats different param-lists as different funcs).
DROP FUNCTION IF EXISTS public.create_user_with_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

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
  -- Caller must be an admin in the same school.
  SELECT school_id, role::text INTO v_caller_school_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('school_admin', 'platform_admin') THEN
    RETURN json_build_object('error', 'Only admins can create users');
  END IF;
  IF v_caller_school_id IS NULL THEN
    RETURN json_build_object('error', 'Admin has no school assigned');
  END IF;

  -- School admins must have an active subscription. Platform admins are exempt.
  IF v_caller_role = 'school_admin' THEN
    SELECT subscription_status INTO v_school_status
    FROM public.schools WHERE id = v_caller_school_id;
    IF v_school_status IS DISTINCT FROM 'active' THEN
      RETURN json_build_object('error', 'School subscription is not active');
    END IF;
  END IF;

  -- Light DOB validation on the server side too — catches admins who
  -- bypass the form. Future dates and ages > 120 are rejected.
  IF p_date_of_birth IS NOT NULL THEN
    IF p_date_of_birth > CURRENT_DATE THEN
      RETURN json_build_object('error', 'Date of birth cannot be in the future');
    END IF;
    IF p_date_of_birth < CURRENT_DATE - INTERVAL '120 years' THEN
      RETURN json_build_object('error', 'Date of birth is unrealistically old');
    END IF;
  END IF;

  v_new_user_id := gen_random_uuid();

  -- Create auth.users + identities (token columns must be '' not NULL
  -- per the fix in migration 014).
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    aud, role, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_new_user_id, '00000000-0000-0000-0000-000000000000',
    p_email, crypt(p_password, gen_salt('bf')),
    NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('first_name', p_first_name, 'last_name', p_last_name)::jsonb,
    'authenticated', 'authenticated', NOW(), NOW(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_new_user_id, v_new_user_id,
    json_build_object('sub', v_new_user_id::text, 'email', p_email)::jsonb,
    'email', NOW(), NOW(), NOW()
  );

  -- Now the profile row. The institutional_id trigger from migration
  -- 029 fires here and fills the ID column.
  INSERT INTO public.profiles (
    user_id, school_id, role,
    first_name, last_name, email, phone, address,
    date_of_birth, place_of_birth, gender, is_active
  ) VALUES (
    v_new_user_id, v_caller_school_id, p_role,
    p_first_name, p_last_name, p_email, p_phone, p_address,
    p_date_of_birth, p_place_of_birth, p_gender, TRUE
  ) RETURNING id INTO v_new_profile_id;

  RETURN json_build_object(
    'user_id',    v_new_user_id,
    'profile_id', v_new_profile_id,
    'email',      p_email,
    'role',       p_role
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_with_profile(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT
) TO authenticated;
