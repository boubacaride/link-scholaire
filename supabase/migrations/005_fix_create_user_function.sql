-- Drop old version
DROP FUNCTION IF EXISTS public.create_user_with_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Recreate with fixes:
-- 1. Use gen_random_uuid() instead of extensions.uuid_generate_v4()
-- 2. Use pgcrypto crypt/gen_salt (enable extension if needed)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  v_new_user_id UUID;
  v_new_profile_id UUID;
BEGIN
  -- Check caller is admin
  SELECT school_id, role::text INTO v_caller_school_id, v_caller_role
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('school_admin', 'platform_admin') THEN
    RETURN json_build_object('error', 'Only admins can create users');
  END IF;

  IF v_caller_school_id IS NULL THEN
    RETURN json_build_object('error', 'Admin has no school assigned');
  END IF;

  -- Generate UUID
  v_new_user_id := gen_random_uuid();

  -- Create auth user
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
    confirmation_token,
    is_super_admin
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated',
    '',
    FALSE
  );

  -- Create identity (required for Supabase Auth sign-in)
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
    gen_random_uuid(),
    v_new_user_id,
    lower(trim(p_email)),
    jsonb_build_object('sub', v_new_user_id::text, 'email', lower(trim(p_email))),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- Create profile
  INSERT INTO public.profiles (
    user_id,
    school_id,
    role,
    first_name,
    last_name,
    email,
    phone,
    address,
    is_active
  ) VALUES (
    v_new_user_id,
    v_caller_school_id,
    p_role,
    p_first_name,
    p_last_name,
    lower(trim(p_email)),
    p_phone,
    p_address,
    TRUE
  )
  RETURNING id INTO v_new_profile_id;

  RETURN json_build_object(
    'success', TRUE,
    'user_id', v_new_user_id,
    'profile_id', v_new_profile_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('error', 'A user with this email already exists');
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;
