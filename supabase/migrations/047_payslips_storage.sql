-- ═══════════════════════════════════════════════════════════════════
-- 047 · Payslips storage bucket (PDF attachments for sharing)
-- ───────────────────────────────────────────────────────────────────
-- A private bucket holds the generated payslip PDFs so the admin can
-- share a direct link to the actual file (a time-limited signed URL)
-- instead of only an in-app link. Objects are keyed by school, e.g.
--   <school_id>/payslip-<employee_id>-<YYYY-MM>.pdf
--
-- Only admins write/read; sharing is done with short-lived signed URLs
-- created server-side, so recipients need no Supabase session.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Admins of a school manage payslip objects under that school's prefix.
-- The first path segment is the school id.
DROP POLICY IF EXISTS "Admins read payslip files" ON storage.objects;
CREATE POLICY "Admins read payslip files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payslips'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = public.auth_school_id()::text
  );

DROP POLICY IF EXISTS "Admins upload payslip files" ON storage.objects;
CREATE POLICY "Admins upload payslip files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payslips'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = public.auth_school_id()::text
  );

DROP POLICY IF EXISTS "Admins update payslip files" ON storage.objects;
CREATE POLICY "Admins update payslip files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payslips'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = public.auth_school_id()::text
  )
  WITH CHECK (
    bucket_id = 'payslips'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = public.auth_school_id()::text
  );

DROP POLICY IF EXISTS "Admins delete payslip files" ON storage.objects;
CREATE POLICY "Admins delete payslip files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payslips'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = public.auth_school_id()::text
  );
