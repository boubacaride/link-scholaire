-- ─── Function: Admin creates a new user with profile ────────────────
-- This creates an auth.users entry + a profiles entry in one call.
-- Only admins can call this (checked inside the function).

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
SET search_path = public
AS $$
DECLARE
  v_caller_school_id UUID;
  v_caller_role TEXT;
  v_new_user_id UUID;
  v_new_profile_id UUID;
BEGIN
  -- Check caller is admin
  SELECT school_id, role INTO v_caller_school_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role NOT IN ('school_admin', 'platform_admin') THEN
    RETURN json_build_object('error', 'Only admins can create users');
  END IF;

  -- Create auth user
  v_new_user_id := extensions.uuid_generate_v4();

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud,
    confirmation_token
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('first_name', p_first_name, 'last_name', p_last_name)::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated',
    ''
  );

  -- Also insert into auth.identities (required by Supabase Auth)
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    v_new_user_id,
    p_email,
    json_build_object('sub', v_new_user_id::text, 'email', p_email)::jsonb,
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- Create profile
  INSERT INTO public.profiles (
    user_id, school_id, role, first_name, last_name, email, phone, address, is_active
  ) VALUES (
    v_new_user_id, v_caller_school_id, p_role, p_first_name, p_last_name, p_email, p_phone, p_address, TRUE
  )
  RETURNING id INTO v_new_profile_id;

  RETURN json_build_object(
    'success', TRUE,
    'user_id', v_new_user_id,
    'profile_id', v_new_profile_id
  );

EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('error', 'A user with this email already exists');
WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;
