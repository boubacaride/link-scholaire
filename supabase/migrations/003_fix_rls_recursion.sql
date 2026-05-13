-- ─── FIX: Infinite recursion in RLS policies ───────────────────────
-- The problem: policies on "profiles" reference "profiles" via subquery,
-- which triggers the same policy check → infinite loop.
-- The fix: SECURITY DEFINER helper functions that bypass RLS.

-- Helper: get current user's school_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: get current user's profile id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: get current user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('school_admin', 'platform_admin')
  );
$$;

-- ─── DROP ALL EXISTING POLICIES AND RECREATE ────────────────────────

-- SCHOOLS
DROP POLICY IF EXISTS "Users can view their school" ON public.schools;
CREATE POLICY "Users can view their school" ON public.schools
  FOR SELECT USING (id = public.auth_school_id());

-- PROFILES
DROP POLICY IF EXISTS "Users can view profiles in their school" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles in school" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "Users can view profiles in their school" ON public.profiles
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can update profiles in school" ON public.profiles
  FOR UPDATE USING (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- CLASSES
DROP POLICY IF EXISTS "Users can view classes in their school" ON public.classes;
DROP POLICY IF EXISTS "Admins can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can update classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can delete classes" ON public.classes;

CREATE POLICY "Users can view classes in their school" ON public.classes
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Admins can insert classes" ON public.classes
  FOR INSERT WITH CHECK (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can update classes" ON public.classes
  FOR UPDATE USING (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can delete classes" ON public.classes
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- SUBJECTS
DROP POLICY IF EXISTS "Users can view subjects in their school" ON public.subjects;
DROP POLICY IF EXISTS "Admins can insert subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can update subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can delete subjects" ON public.subjects;

CREATE POLICY "Users can view subjects in their school" ON public.subjects
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Admins can insert subjects" ON public.subjects
  FOR INSERT WITH CHECK (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can update subjects" ON public.subjects
  FOR UPDATE USING (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can delete subjects" ON public.subjects
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- CLASS_SUBJECTS
DROP POLICY IF EXISTS "School-scoped access" ON public.class_subjects;
DROP POLICY IF EXISTS "Admins can insert class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "Admins can update class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "Admins can delete class_subjects" ON public.class_subjects;

CREATE POLICY "Users can view class_subjects" ON public.class_subjects
  FOR SELECT USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id = public.auth_school_id())
  );

CREATE POLICY "Admins can insert class_subjects" ON public.class_subjects
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update class_subjects" ON public.class_subjects
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete class_subjects" ON public.class_subjects
  FOR DELETE USING (public.is_admin());

-- STUDENT_CLASSES
DROP POLICY IF EXISTS "School-scoped access" ON public.student_classes;
DROP POLICY IF EXISTS "Admins can insert student_classes" ON public.student_classes;
DROP POLICY IF EXISTS "Admins can update student_classes" ON public.student_classes;
DROP POLICY IF EXISTS "Admins can delete student_classes" ON public.student_classes;

CREATE POLICY "Users can view student_classes" ON public.student_classes
  FOR SELECT USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id = public.auth_school_id())
  );

CREATE POLICY "Admins can insert student_classes" ON public.student_classes
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update student_classes" ON public.student_classes
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete student_classes" ON public.student_classes
  FOR DELETE USING (public.is_admin());

-- PARENT_STUDENTS
DROP POLICY IF EXISTS "School-scoped access" ON public.parent_students;
DROP POLICY IF EXISTS "Admins can insert parent_students" ON public.parent_students;
DROP POLICY IF EXISTS "Admins can delete parent_students" ON public.parent_students;

CREATE POLICY "Users can view parent_students" ON public.parent_students
  FOR SELECT USING (
    parent_id = public.auth_profile_id()
    OR student_id = public.auth_profile_id()
    OR public.is_admin()
  );

CREATE POLICY "Admins can insert parent_students" ON public.parent_students
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete parent_students" ON public.parent_students
  FOR DELETE USING (public.is_admin());

-- CONTENT
DROP POLICY IF EXISTS "Users can view content in their school" ON public.content;
DROP POLICY IF EXISTS "Teachers can create content" ON public.content;
DROP POLICY IF EXISTS "Teachers can update own content" ON public.content;
DROP POLICY IF EXISTS "Admins can create content" ON public.content;
DROP POLICY IF EXISTS "Admins can update content" ON public.content;
DROP POLICY IF EXISTS "Admins can delete content" ON public.content;

CREATE POLICY "Users can view content in their school" ON public.content
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Teachers and admins can create content" ON public.content
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

CREATE POLICY "Teachers can update own content" ON public.content
  FOR UPDATE USING (
    teacher_id = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

CREATE POLICY "Admins can delete content" ON public.content
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- GRADES
DROP POLICY IF EXISTS "Users can view relevant grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can insert grades" ON public.grades;
DROP POLICY IF EXISTS "Teachers can update grades" ON public.grades;
DROP POLICY IF EXISTS "Admins can delete grades" ON public.grades;

CREATE POLICY "Users can view relevant grades" ON public.grades
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR recorded_by = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

CREATE POLICY "Teachers can insert grades" ON public.grades
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

CREATE POLICY "Teachers can update grades" ON public.grades
  FOR UPDATE USING (
    recorded_by = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

CREATE POLICY "Admins can delete grades" ON public.grades
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- SUBMISSIONS
DROP POLICY IF EXISTS "Users can view relevant submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can submit work" ON public.submissions;
DROP POLICY IF EXISTS "Students can update own submissions" ON public.submissions;

CREATE POLICY "Users can view relevant submissions" ON public.submissions
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR content_id IN (SELECT id FROM public.content WHERE teacher_id = public.auth_profile_id())
    OR public.is_admin()
  );

CREATE POLICY "Students can submit work" ON public.submissions
  FOR INSERT WITH CHECK (student_id = public.auth_profile_id());

CREATE POLICY "Students can update own submissions" ON public.submissions
  FOR UPDATE USING (
    student_id = public.auth_profile_id()
    AND status IN ('pending', 'submitted')
  );

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- EVENTS
DROP POLICY IF EXISTS "School-scoped access" ON public.events;
DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;

CREATE POLICY "Users can view events" ON public.events
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Admins can insert events" ON public.events
  FOR INSERT WITH CHECK (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can update events" ON public.events
  FOR UPDATE USING (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can delete events" ON public.events
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- ANNOUNCEMENTS
DROP POLICY IF EXISTS "School-scoped access" ON public.announcements;
DROP POLICY IF EXISTS "Admins can insert announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can update announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can delete announcements" ON public.announcements;

CREATE POLICY "Users can view announcements" ON public.announcements
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Admins can insert announcements" ON public.announcements
  FOR INSERT WITH CHECK (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can update announcements" ON public.announcements
  FOR UPDATE USING (school_id = public.auth_school_id() AND public.is_admin());

CREATE POLICY "Admins can delete announcements" ON public.announcements
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- LESSONS
DROP POLICY IF EXISTS "School-scoped access" ON public.lessons;
DROP POLICY IF EXISTS "Admins can insert lessons" ON public.lessons;
DROP POLICY IF EXISTS "Admins can update lessons" ON public.lessons;
DROP POLICY IF EXISTS "Admins can delete lessons" ON public.lessons;

CREATE POLICY "Users can view lessons" ON public.lessons
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Teachers and admins can insert lessons" ON public.lessons
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

CREATE POLICY "Teachers and admins can update lessons" ON public.lessons
  FOR UPDATE USING (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

CREATE POLICY "Admins can delete lessons" ON public.lessons
  FOR DELETE USING (school_id = public.auth_school_id() AND public.is_admin());

-- ATTENDANCE
DROP POLICY IF EXISTS "School-scoped access" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update attendance" ON public.attendance;

CREATE POLICY "Users can view attendance" ON public.attendance
  FOR SELECT USING (school_id = public.auth_school_id());

CREATE POLICY "Teachers can insert attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

CREATE POLICY "Teachers can update attendance" ON public.attendance
  FOR UPDATE USING (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

-- STUDENT_FEES
DROP POLICY IF EXISTS "Users can view relevant fees" ON public.student_fees;

CREATE POLICY "Users can view relevant fees" ON public.student_fees
  FOR SELECT USING (
    (school_id = public.auth_school_id() AND public.is_admin())
    OR student_id IN (SELECT student_id FROM public.parent_students WHERE parent_id = public.auth_profile_id())
    OR student_id = public.auth_profile_id()
  );

-- PAYROLL
DROP POLICY IF EXISTS "Users can view relevant payroll" ON public.payroll;

CREATE POLICY "Users can view relevant payroll" ON public.payroll
  FOR SELECT USING (
    (school_id = public.auth_school_id() AND public.is_admin())
    OR employee_id = public.auth_profile_id()
  );
