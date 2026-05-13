-- ═══════════════════════════════════════════════════════════════════
-- SchoolFlow — Seed Data
-- Run this AFTER creating auth users in the Supabase dashboard
-- ═══════════════════════════════════════════════════════════════════

-- ─── DEMO SCHOOL ──────────────────────────────────────────────────
INSERT INTO public.schools (id, name, type, address, city, state, country, phone, email, subscription_status, subscription_plan, max_students, max_teachers)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Lincoln Academy',
  'private',
  '1200 Education Blvd',
  'Springfield',
  'IL',
  'US',
  '(217) 555-0100',
  'admin@lincolnacademy.edu',
  'active',
  'premium',
  500,
  50
);

-- ─── PROFILES (linked to auth users) ─────────────────────────────
-- NOTE: Replace the user_id UUIDs below with REAL auth.users IDs
-- after creating accounts in Supabase Auth dashboard or via signup

-- School Admin
INSERT INTO public.profiles (id, user_id, school_id, role, first_name, last_name, email)
VALUES (
  'aaaa0001-0001-0001-0001-000000000001',
  'd2bb7b88-f76d-4fe0-995c-31533dc1f9f5',
  '11111111-1111-1111-1111-111111111111',
  'school_admin',
  'Sarah',
  'Mitchell',
  'admin@lincolnacademy.edu'
);

-- Teacher
INSERT INTO public.profiles (id, user_id, school_id, role, first_name, last_name, email)
VALUES (
  'aaaa0002-0002-0002-0002-000000000002',
  '78cdea70-7854-4a68-a01b-45bb33d41652',
  '11111111-1111-1111-1111-111111111111',
  'teacher',
  'James',
  'Wilson',
  'teacher@lincolnacademy.edu'
);

-- Student
INSERT INTO public.profiles (id, user_id, school_id, role, first_name, last_name, email)
VALUES (
  'aaaa0003-0003-0003-0003-000000000003',
  '4faabb3c-e885-4588-ae2f-b51908742d08',
  '11111111-1111-1111-1111-111111111111',
  'student',
  'Emma',
  'Johnson',
  'student@lincolnacademy.edu'
);

-- Parent
INSERT INTO public.profiles (id, user_id, school_id, role, first_name, last_name, email)
VALUES (
  'aaaa0004-0004-0004-0004-000000000004',
  'f53bd6e7-e665-4b79-bd8f-4da781f1af2e',
  '11111111-1111-1111-1111-111111111111',
  'parent',
  'Robert',
  'Johnson',
  'parent@lincolnacademy.edu'
);

-- ─── LINK PARENT TO STUDENT ──────────────────────────────────────
INSERT INTO public.parent_students (parent_id, student_id)
VALUES (
  'aaaa0004-0004-0004-0004-000000000004',
  'aaaa0003-0003-0003-0003-000000000003'
);

-- ─── SUBJECTS ────────────────────────────────────────────────────
INSERT INTO public.subjects (id, school_id, name, code, description) VALUES
  ('bbbb0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Mathematics', 'MATH101', 'Algebra, Geometry, and Calculus'),
  ('bbbb0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'English Language Arts', 'ELA101', 'Reading, Writing, and Literature'),
  ('bbbb0003-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', 'Science', 'SCI101', 'Biology, Chemistry, and Physics'),
  ('bbbb0004-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'History', 'HIST101', 'US and World History'),
  ('bbbb0005-0005-0005-0005-000000000005', '11111111-1111-1111-1111-111111111111', 'Computer Science', 'CS101', 'Programming and Digital Literacy'),
  ('bbbb0006-0006-0006-0006-000000000006', '11111111-1111-1111-1111-111111111111', 'Physical Education', 'PE101', 'Sports and Fitness');

-- ─── CLASSES ─────────────────────────────────────────────────────
INSERT INTO public.classes (id, school_id, name, grade, section, capacity, academic_year) VALUES
  ('cccc0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Grade 9 - Section A', 9, 'A', 30, '2025-2026'),
  ('cccc0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'Grade 9 - Section B', 9, 'B', 30, '2025-2026'),
  ('cccc0003-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', 'Grade 10 - Section A', 10, 'A', 30, '2025-2026'),
  ('cccc0004-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'Grade 10 - Section B', 10, 'B', 30, '2025-2026'),
  ('cccc0005-0005-0005-0005-000000000005', '11111111-1111-1111-1111-111111111111', 'Grade 11 - Section A', 11, 'A', 30, '2025-2026'),
  ('cccc0006-0006-0006-0006-000000000006', '11111111-1111-1111-1111-111111111111', 'Grade 12 - Section A', 12, 'A', 30, '2025-2026');

-- ─── CLASS-SUBJECT-TEACHER ASSIGNMENTS ───────────────────────────
INSERT INTO public.class_subjects (class_id, subject_id, teacher_id) VALUES
  ('cccc0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 'aaaa0002-0002-0002-0002-000000000002'),
  ('cccc0001-0001-0001-0001-000000000001', 'bbbb0002-0002-0002-0002-000000000002', 'aaaa0002-0002-0002-0002-000000000002'),
  ('cccc0001-0001-0001-0001-000000000001', 'bbbb0003-0003-0003-0003-000000000003', 'aaaa0002-0002-0002-0002-000000000002'),
  ('cccc0003-0003-0003-0003-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 'aaaa0002-0002-0002-0002-000000000002'),
  ('cccc0003-0003-0003-0003-000000000003', 'bbbb0005-0005-0005-0005-000000000005', 'aaaa0002-0002-0002-0002-000000000002');

-- ─── ENROLL STUDENT IN CLASSES ───────────────────────────────────
INSERT INTO public.student_classes (student_id, class_id, academic_year) VALUES
  ('aaaa0003-0003-0003-0003-000000000003', 'cccc0001-0001-0001-0001-000000000001', '2025-2026');

-- ─── TIMETABLE / LESSONS ─────────────────────────────────────────
INSERT INTO public.lessons (school_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time) VALUES
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 'aaaa0002-0002-0002-0002-000000000002', 1, '08:00', '09:00'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0002-0002-0002-0002-000000000002', 'aaaa0002-0002-0002-0002-000000000002', 1, '09:15', '10:15'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0003-0003-0003-0003-000000000003', 'aaaa0002-0002-0002-0002-000000000002', 1, '10:30', '11:30'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 'aaaa0002-0002-0002-0002-000000000002', 2, '08:00', '09:00'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0005-0005-0005-0005-000000000005', 'aaaa0002-0002-0002-0002-000000000002', 2, '09:15', '10:15'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0002-0002-0002-0002-000000000002', 'aaaa0002-0002-0002-0002-000000000002', 3, '08:00', '09:00'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0003-0003-0003-0003-000000000003', 'aaaa0002-0002-0002-0002-000000000002', 3, '09:15', '10:15'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0006-0006-0006-0006-000000000006', 'aaaa0002-0002-0002-0002-000000000002', 4, '08:00', '09:00'),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0004-0004-0004-0004-000000000004', 'aaaa0002-0002-0002-0002-000000000002', 5, '08:00', '09:00');

-- ─── SAMPLE CONTENT ──────────────────────────────────────────────
INSERT INTO public.content (school_id, class_id, subject_id, teacher_id, title, description, type, due_date, max_score, is_published) VALUES
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 'aaaa0002-0002-0002-0002-000000000002', 'Introduction to Algebra', 'Linear equations and inequalities', 'lesson', NULL, NULL, TRUE),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 'aaaa0002-0002-0002-0002-000000000002', 'Algebra Homework Set 1', 'Solve linear equations 1-20', 'assignment', NOW() + INTERVAL '7 days', 100, TRUE),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0002-0002-0002-0002-000000000002', 'aaaa0002-0002-0002-0002-000000000002', 'Essay: To Kill a Mockingbird', 'Write a 500-word literary analysis', 'assignment', NOW() + INTERVAL '14 days', 100, TRUE),
  ('11111111-1111-1111-1111-111111111111', 'cccc0001-0001-0001-0001-000000000001', 'bbbb0003-0003-0003-0003-000000000003', 'aaaa0002-0002-0002-0002-000000000002', 'Lab: Cell Structure', 'Identify organelles under a microscope', 'classwork', NOW() + INTERVAL '3 days', 50, TRUE);

-- ─── SAMPLE EVENTS ───────────────────────────────────────────────
INSERT INTO public.events (school_id, title, description, start_date, end_date) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Spring Break', 'No classes', NOW() + INTERVAL '30 days', NOW() + INTERVAL '37 days'),
  ('11111111-1111-1111-1111-111111111111', 'Parent-Teacher Conference', 'Bi-annual conference', NOW() + INTERVAL '14 days', NOW() + INTERVAL '14 days'),
  ('11111111-1111-1111-1111-111111111111', 'Science Fair', 'Annual science fair competition', NOW() + INTERVAL '45 days', NOW() + INTERVAL '45 days');

-- ─── SAMPLE ANNOUNCEMENTS ────────────────────────────────────────
INSERT INTO public.announcements (school_id, title, description, author_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Welcome to the New Semester', 'We are excited to kick off the 2025-2026 academic year. Please review the updated handbook.', 'aaaa0001-0001-0001-0001-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Uniform Policy Reminder', 'All students must wear proper uniforms starting next Monday.', 'aaaa0001-0001-0001-0001-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'Math Tutoring Available', 'Free tutoring sessions every Wednesday after school in Room 204.', 'aaaa0002-0002-0002-0002-000000000002');

-- ─── SAMPLE STUDENT FEES ─────────────────────────────────────────
INSERT INTO public.student_fees (school_id, student_id, fee_type, amount, due_date, status, paid_amount, term, academic_year) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaa0003-0003-0003-0003-000000000003', 'tuition', 500000, '2025-09-01', 'paid', 500000, 'Fall 2025', '2025-2026'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa0003-0003-0003-0003-000000000003', 'tuition', 500000, '2026-01-15', 'pending', 0, 'Spring 2026', '2025-2026'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa0003-0003-0003-0003-000000000003', 'lunch', 30000, '2025-09-01', 'paid', 30000, 'Fall 2025', '2025-2026'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa0003-0003-0003-0003-000000000003', 'transport', 25000, '2025-09-01', 'overdue', 0, 'Fall 2025', '2025-2026');
