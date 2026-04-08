-- ═══════════════════════════════════════════════════════════════════
-- SchoolFlow — Multi-Tenant School Management Platform
-- Initial Database Schema
-- ═══════════════════════════════════════════════════════════════════

-- ─── Extensions ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── SCHOOLS (Tenant Root) ──────────────────────────────────────────
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('public', 'private')),
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('active', 'trial', 'expired', 'cancelled')),
  subscription_plan TEXT,
  max_students INTEGER DEFAULT 500,
  max_teachers INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USER PROFILES ──────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_admin', 'school_admin', 'teacher', 'student', 'parent')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  blood_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, school_id)
);

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_school_id ON public.profiles(school_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- ─── CLASSES ────────────────────────────────────────────────────────
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade INTEGER NOT NULL,
  section TEXT,
  capacity INTEGER NOT NULL DEFAULT 30,
  supervisor_id UUID REFERENCES public.profiles(id),
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classes_school_id ON public.classes(school_id);

-- ─── SUBJECTS ───────────────────────────────────────────────────────
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subjects_school_id ON public.subjects(school_id);

-- ─── CLASS-SUBJECT-TEACHER MAPPING ──────────────────────────────────
CREATE TABLE public.class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  UNIQUE(class_id, subject_id)
);

-- ─── STUDENT ENROLLMENT ─────────────────────────────────────────────
CREATE TABLE public.student_classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, class_id, academic_year)
);

CREATE INDEX idx_student_classes_student ON public.student_classes(student_id);
CREATE INDEX idx_student_classes_class ON public.student_classes(class_id);

-- ─── PARENT-STUDENT LINK ────────────────────────────────────────────
CREATE TABLE public.parent_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(parent_id, student_id)
);

-- ─── CONTENT (Lessons, Assignments, Classwork) ──────────────────────
CREATE TABLE public.content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('lesson', 'assignment', 'classwork')),
  content_body TEXT,
  file_urls TEXT[] DEFAULT '{}',
  due_date TIMESTAMPTZ,
  max_score INTEGER,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_school_id ON public.content(school_id);
CREATE INDEX idx_content_class_id ON public.content(class_id);
CREATE INDEX idx_content_teacher_id ON public.content(teacher_id);
CREATE INDEX idx_content_type ON public.content(type);

-- ─── SUBMISSIONS ────────────────────────────────────────────────────
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_urls TEXT[] DEFAULT '{}',
  text_response TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'late', 'graded', 'returned')),
  score INTEGER,
  feedback TEXT,
  submitted_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES public.profiles(id),
  UNIQUE(content_id, student_id)
);

CREATE INDEX idx_submissions_content ON public.submissions(content_id);
CREATE INDEX idx_submissions_student ON public.submissions(student_id);
CREATE INDEX idx_submissions_status ON public.submissions(status);

-- ─── GRADES ─────────────────────────────────────────────────────────
CREATE TABLE public.grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  remarks TEXT,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_grades_student ON public.grades(student_id);
CREATE INDEX idx_grades_class ON public.grades(class_id);

-- ─── LESSONS (Schedule / Timetable) ─────────────────────────────────
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

CREATE INDEX idx_lessons_school ON public.lessons(school_id);
CREATE INDEX idx_lessons_teacher ON public.lessons(teacher_id);

-- ─── ATTENDANCE ─────────────────────────────────────────────────────
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, class_id, date)
);

CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_attendance_student ON public.attendance(student_id);

-- ─── EVENTS ─────────────────────────────────────────────────────────
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  class_id UUID REFERENCES public.classes(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ANNOUNCEMENTS ──────────────────────────────────────────────────
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  class_id UUID REFERENCES public.classes(id),
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── STUDENT FEES (Private Schools) ─────────────────────────────────
CREATE TABLE public.student_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('tuition', 'registration', 'exam', 'transport', 'lunch', 'other')),
  amount INTEGER NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue', 'partial')),
  paid_amount INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fees_student ON public.student_fees(student_id);
CREATE INDEX idx_fees_school ON public.student_fees(school_id);
CREATE INDEX idx_fees_status ON public.student_fees(status);

-- ─── PAYROLL (Private Schools) ──────────────────────────────────────
CREATE TABLE public.payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_salary INTEGER NOT NULL,
  deductions INTEGER NOT NULL DEFAULT 0,
  bonuses INTEGER NOT NULL DEFAULT 0,
  net_salary INTEGER NOT NULL,
  pay_period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue', 'partial')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payroll_employee ON public.payroll(employee_id);
CREATE INDEX idx_payroll_school ON public.payroll(school_id);

-- ─── NOTIFICATIONS ──────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(is_read);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ─── RLS POLICIES ───────────────────────────────────────────────────

-- Schools: Users can only see their own school
CREATE POLICY "Users can view their school" ON public.schools
  FOR SELECT USING (
    id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Profiles: Users can see profiles within their school
CREATE POLICY "Users can view profiles in their school" ON public.profiles
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

-- Classes: Users can see classes in their school
CREATE POLICY "Users can view classes in their school" ON public.classes
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Subjects: Users can see subjects in their school
CREATE POLICY "Users can view subjects in their school" ON public.subjects
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Content: Users can see published content in their school
CREATE POLICY "Users can view content in their school" ON public.content
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
    AND (is_published = TRUE OR teacher_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  );

-- Teachers can create content
CREATE POLICY "Teachers can create content" ON public.content
  FOR INSERT WITH CHECK (
    teacher_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() AND role = 'teacher')
  );

-- Teachers can update their own content
CREATE POLICY "Teachers can update own content" ON public.content
  FOR UPDATE USING (
    teacher_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Submissions: Students can see their own, teachers can see all in their class
CREATE POLICY "Users can view relevant submissions" ON public.submissions
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR content_id IN (
      SELECT id FROM public.content WHERE teacher_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Students can create submissions
CREATE POLICY "Students can submit work" ON public.submissions
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid() AND role = 'student')
  );

-- Students can update their own pending submissions
CREATE POLICY "Students can update own submissions" ON public.submissions
  FOR UPDATE USING (
    student_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND status IN ('pending', 'submitted')
  );

-- Grades: Students see own grades, teachers see grades they recorded
CREATE POLICY "Users can view relevant grades" ON public.grades
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR recorded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
  );

-- Notifications: Users can only see their own
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Student Fees: School admins and parents of the student
CREATE POLICY "Users can view relevant fees" ON public.student_fees
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
    OR student_id IN (SELECT student_id FROM public.parent_students WHERE parent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
    OR student_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Payroll: Only school admins and the employee
CREATE POLICY "Users can view relevant payroll" ON public.payroll
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() AND role IN ('school_admin', 'platform_admin'))
    OR employee_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Generic school-scoped policies for remaining tables
CREATE POLICY "School-scoped access" ON public.class_subjects
  FOR SELECT USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid()))
  );

CREATE POLICY "School-scoped access" ON public.student_classes
  FOR SELECT USING (
    class_id IN (SELECT id FROM public.classes WHERE school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid()))
  );

CREATE POLICY "School-scoped access" ON public.parent_students
  FOR SELECT USING (
    parent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR student_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "School-scoped access" ON public.lessons
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "School-scoped access" ON public.attendance
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "School-scoped access" ON public.events
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "School-scoped access" ON public.announcements
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- ─── FUNCTIONS ──────────────────────────────────────────────────────

-- Get user's role and school
CREATE OR REPLACE FUNCTION public.get_user_context()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT p.*, s.name as school_name, s.type as school_type
  INTO v_profile
  FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.user_id = auth.uid()
  AND p.is_active = TRUE
  LIMIT 1;

  IF v_profile IS NULL THEN
    RETURN json_build_object('error', 'No active profile found');
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
