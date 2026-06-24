-- ═══════════════════════════════════════════════════════════════════
-- 026 · Avatars storage bucket + student documents table & bucket
-- ───────────────────────────────────────────────────────────────────
-- Powers three new Settings / Profile features:
--   1. Every user can upload an avatar from /profile. We add the public
--      `avatars` storage bucket so the existing profiles.avatar_url
--      column can hold a real URL the app can render.
--   2. School admins / teachers issue documents (report cards, official
--      letters, certificates …) to a student. Students see their own
--      docs at /my-documents; linked parents see their child's.
--   3. Documents live in the private `student-documents` bucket with
--      per-school folder isolation; metadata sits in the new
--      `student_documents` table.
-- ═══════════════════════════════════════════════════════════════════


-- ─── AVATARS STORAGE BUCKET ───────────────────────────────────────
-- Public bucket so avatar URLs render directly without per-request
-- signed URLs. Path convention: <user_id>/<timestamp>-<filename>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload only to their own folder.
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (bucket is public) so <img src> works without signing.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');


-- ─── STUDENT DOCUMENTS TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('report_card', 'certificate', 'letter', 'transcript', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,           -- key inside the student-documents bucket
  file_name TEXT NOT NULL,
  file_size BIGINT,
  term TEXT,
  academic_year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_documents_student   ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_school    ON public.student_documents(school_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_category  ON public.student_documents(category);

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

-- Visibility:
--   • The student themself
--   • A parent linked to the student
--   • Teachers / admins of the same school
DROP POLICY IF EXISTS "Read own / child / school documents" ON public.student_documents;
CREATE POLICY "Read own / child / school documents" ON public.student_documents
  FOR SELECT USING (
    student_id = public.auth_profile_id()
    OR student_id IN (
      SELECT student_id FROM public.parent_students
      WHERE parent_id = public.auth_profile_id()
    )
    OR (school_id = public.auth_school_id()
        AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin'))
  );

-- Only teachers + admins create / update / delete.
DROP POLICY IF EXISTS "Teachers and admins can write documents" ON public.student_documents;
CREATE POLICY "Teachers and admins can write documents" ON public.student_documents
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    AND uploaded_by = public.auth_profile_id()
  );

DROP POLICY IF EXISTS "Teachers and admins can update documents" ON public.student_documents;
CREATE POLICY "Teachers and admins can update documents" ON public.student_documents
  FOR UPDATE USING (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

DROP POLICY IF EXISTS "Teachers and admins can delete documents" ON public.student_documents;
CREATE POLICY "Teachers and admins can delete documents" ON public.student_documents
  FOR DELETE USING (
    school_id = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );


-- ─── STUDENT DOCUMENTS STORAGE BUCKET ─────────────────────────────
-- Private bucket. Path convention: <school_id>/<student_id>/<timestamp>-<file>
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Read student documents (school members)" ON storage.objects;
CREATE POLICY "Read student documents (school members)" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
    AND (
      -- The student or a linked parent (folder[2] is the student's profile id)
      (storage.foldername(name))[2]::uuid = public.auth_profile_id()
      OR (storage.foldername(name))[2]::uuid IN (
        SELECT student_id FROM public.parent_students
        WHERE parent_id = public.auth_profile_id()
      )
      -- Any teacher / admin of the same school
      OR public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
    )
  );

DROP POLICY IF EXISTS "Teachers and admins can upload student documents" ON storage.objects;
CREATE POLICY "Teachers and admins can upload student documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

DROP POLICY IF EXISTS "Teachers and admins can delete student documents" ON storage.objects;
CREATE POLICY "Teachers and admins can delete student documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1]::uuid = public.auth_school_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );
