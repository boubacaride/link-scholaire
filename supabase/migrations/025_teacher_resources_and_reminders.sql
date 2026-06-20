-- ═══════════════════════════════════════════════════════════════════
-- 025 · Teacher resource library + reminder notifications
-- ───────────────────────────────────────────────────────────────────
-- This migration powers three new teacher capabilities on the Teacher
-- dashboard's Lesson Planner:
--   1. Rich-text bodies for Lessons / Assignments / Classwork
--      (content_body already exists as TEXT; we now store HTML).
--   2. Arbitrary file attachments (the existing `file_urls TEXT[]`
--      column accepts as many URLs as we need — we add a private
--      Supabase Storage bucket `teacher-content` to host them).
--   3. A dedicated slot for PowerPoint / slide decks per lesson
--      (new `slides_url TEXT` column — rendered with Office Web
--      Viewer or `<iframe>` on the student side).
--
-- It also unlocks the new "Send Reminder" feature: teachers can
-- broadcast a notification (test / exam / homework due) to every
-- student in one of their classes. That requires an INSERT policy on
-- `notifications` for teachers and admins.
-- ═══════════════════════════════════════════════════════════════════

-- ─── CONTENT TABLE: slides column ─────────────────────────────────
ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS slides_url TEXT;

COMMENT ON COLUMN public.content.slides_url IS
  'Optional URL to a slide deck (PowerPoint, PDF, Google Slides) attached to a lesson.';


-- ─── NOTIFICATIONS: teacher / admin INSERT policy ─────────────────
-- The base schema only allowed users to SELECT / UPDATE their own
-- notifications. We add an INSERT policy so teachers and admins can
-- push reminders to other users INSIDE the same school.
DROP POLICY IF EXISTS "Teachers and admins can create notifications" ON public.notifications;
CREATE POLICY "Teachers and admins can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND user_id IN (
      SELECT user_id FROM public.profiles WHERE school_id = public.auth_school_id()
    )
  );


-- ─── STORAGE BUCKET for teacher attachments ───────────────────────
-- Private bucket; access is gated by RLS below. Path convention used
-- by the app is `<school_id>/<teacher_profile_id>/<timestamp>-<file>`
-- so we can enforce school isolation at the bucket level.
INSERT INTO storage.buckets (id, name, public)
VALUES ('teacher-content', 'teacher-content', false)
ON CONFLICT (id) DO NOTHING;

-- Any member of the same school can read attached resources.
DROP POLICY IF EXISTS "School members can read teacher content" ON storage.objects;
CREATE POLICY "School members can read teacher content" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'teacher-content'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
  );

-- Teachers and admins can upload to their own school's folder.
DROP POLICY IF EXISTS "Teachers can upload teacher content" ON storage.objects;
CREATE POLICY "Teachers can upload teacher content" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'teacher-content'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

-- Allow re-upload (upsert) of the same path by the uploader's school.
DROP POLICY IF EXISTS "Teachers can update teacher content" ON storage.objects;
CREATE POLICY "Teachers can update teacher content" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'teacher-content'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

-- Teachers and admins can delete files they own. We restrict deletes to
-- the same school so a teacher can't wipe another tenant's bucket.
DROP POLICY IF EXISTS "Teachers can delete teacher content" ON storage.objects;
CREATE POLICY "Teachers can delete teacher content" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'teacher-content'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );
