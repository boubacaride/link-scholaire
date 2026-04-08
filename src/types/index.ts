// ─── Enums ──────────────────────────────────────────────────────────

export type UserRole = 'platform_admin' | 'school_admin' | 'teacher' | 'student' | 'parent';
export type SchoolType = 'public' | 'private';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled';
export type ContentType = 'lesson' | 'assignment' | 'classwork';
export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'graded' | 'returned';
export type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'partial';
export type FeeType = 'tuition' | 'registration' | 'exam' | 'transport' | 'lunch' | 'other';

// ─── Core Entities ──────────────────────────────────────────────────

export interface School {
  id: string;
  name: string;
  type: SchoolType;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  logo_url: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: string | null;
  max_students: number;
  max_teachers: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  school_id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  blood_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  grade: number;
  section: string | null;
  capacity: number;
  supervisor_id: string | null;
  academic_year: string;
  created_at: string;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_at: string;
}

export interface ClassSubject {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
}

export interface StudentClass {
  id: string;
  student_id: string;
  class_id: string;
  academic_year: string;
  enrolled_at: string;
}

// ─── Content & LMS ─────────────────────────────────────────────────

export interface Content {
  id: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  type: ContentType;
  content_body: string | null;
  file_urls: string[];
  due_date: string | null;
  max_score: number | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  content_id: string;
  student_id: string;
  file_urls: string[];
  text_response: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  graded_by: string | null;
}

export interface Grade {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  exam_type: string;
  score: number;
  max_score: number;
  term: string;
  academic_year: string;
  remarks: string | null;
  recorded_by: string;
  created_at: string;
}

// ─── Scheduling ─────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface Event {
  id: string;
  school_id: string;
  title: string;
  description: string | null;
  class_id: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  school_id: string;
  title: string;
  description: string;
  class_id: string | null;
  author_id: string;
  created_at: string;
}

// ─── Financial (Private Schools) ────────────────────────────────────

export interface StudentFee {
  id: string;
  school_id: string;
  student_id: string;
  fee_type: FeeType;
  amount: number;
  due_date: string;
  status: PaymentStatus;
  paid_amount: number;
  paid_at: string | null;
  term: string;
  academic_year: string;
  notes: string | null;
  created_at: string;
}

export interface PayrollRecord {
  id: string;
  school_id: string;
  employee_id: string;
  base_salary: number;
  deductions: number;
  bonuses: number;
  net_salary: number;
  pay_period: string;
  status: PaymentStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Parent-Student Link ────────────────────────────────────────────

export interface ParentStudent {
  id: string;
  parent_id: string;
  student_id: string;
}

// ─── Attendance ─────────────────────────────────────────────────────

export interface Attendance {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  recorded_by: string;
  created_at: string;
}

// ─── Notifications ──────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  school_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}
