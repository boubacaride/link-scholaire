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
