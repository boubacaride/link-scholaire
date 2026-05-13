-- ─── INSERT/UPDATE/DELETE POLICIES FOR ADMINS & TEACHERS ────────────
-- Admins (school_admin, platform_admin) can create/update/delete most records
-- Teachers can create/update grades and manage their class data

-- Helper: check if user is an admin in their school
-- Used in policies below via inline subquery

-- ─── SUBJECTS ───────────────────────────────────────────────────────
CREATE POLICY "Admins can insert subjects" ON public.subjects
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can update subjects" ON public.subjects
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete subjects" ON public.subjects
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── CLASSES ────────────────────────────────────────────────────────
CREATE POLICY "Admins can insert classes" ON public.classes
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can update classes" ON public.classes
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete classes" ON public.classes
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── PROFILES (admin can create/update other profiles) ──────────────
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can update profiles in school" ON public.profiles
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── CLASS_SUBJECTS (teacher-class-subject assignments) ─────────────
CREATE POLICY "Admins can insert class_subjects" ON public.class_subjects
  FOR INSERT WITH CHECK (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

CREATE POLICY "Admins can update class_subjects" ON public.class_subjects
  FOR UPDATE USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

CREATE POLICY "Admins can delete class_subjects" ON public.class_subjects
  FOR DELETE USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

-- ─── STUDENT_CLASSES (enrollment) ───────────────────────────────────
CREATE POLICY "Admins can insert student_classes" ON public.student_classes
  FOR INSERT WITH CHECK (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

CREATE POLICY "Admins can update student_classes" ON public.student_classes
  FOR UPDATE USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

CREATE POLICY "Admins can delete student_classes" ON public.student_classes
  FOR DELETE USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

-- ─── PARENT_STUDENTS (parent-child links) ───────────────────────────
CREATE POLICY "Admins can insert parent_students" ON public.parent_students
  FOR INSERT WITH CHECK (
    parent_id IN (SELECT id FROM public.profiles WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

CREATE POLICY "Admins can delete parent_students" ON public.parent_students
  FOR DELETE USING (
    parent_id IN (SELECT id FROM public.profiles WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin')))
  );

-- ─── GRADES ─────────────────────────────────────────────────────────
CREATE POLICY "Teachers can insert grades" ON public.grades
  FOR INSERT WITH CHECK (
    recorded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('teacher', 'school_admin', 'platform_admin'))
  );

CREATE POLICY "Teachers can update grades" ON public.grades
  FOR UPDATE USING (
    recorded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete grades" ON public.grades
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── CONTENT (admins can also create, not just teachers) ────────────
CREATE POLICY "Admins can create content" ON public.content
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can update content" ON public.content
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete content" ON public.content
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── EVENTS ─────────────────────────────────────────────────────────
CREATE POLICY "Admins can insert events" ON public.events
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can update events" ON public.events
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete events" ON public.events
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── ANNOUNCEMENTS ──────────────────────────────────────────────────
CREATE POLICY "Admins can insert announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can update announcements" ON public.announcements
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

CREATE POLICY "Admins can delete announcements" ON public.announcements
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── LESSONS ────────────────────────────────────────────────────────
CREATE POLICY "Admins can insert lessons" ON public.lessons
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin', 'teacher'))
  );

CREATE POLICY "Admins can update lessons" ON public.lessons
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin', 'teacher'))
  );

CREATE POLICY "Admins can delete lessons" ON public.lessons
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- ─── ATTENDANCE ─────────────────────────────────────────────────────
CREATE POLICY "Teachers can insert attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin', 'teacher'))
  );

CREATE POLICY "Teachers can update attendance" ON public.attendance
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin', 'teacher'))
  );
