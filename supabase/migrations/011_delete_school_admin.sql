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
