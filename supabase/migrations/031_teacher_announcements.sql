-- ═══════════════════════════════════════════════════════════════════
-- 031 · Teacher announcements + multi-class audience targeting
-- ───────────────────────────────────────────────────────────────────
-- Two changes:
--
--   1. New `announcement_audiences` junction table so a single
--      announcement can target multiple classes (per spec — "Multi-
--      class checklist" answer in Task 3 design). When zero audience
--      rows exist, the announcement is school-wide (admin-only).
--
--   2. RLS rewrite so:
--        • TEACHERS can INSERT announcements they author, and INSERT
--          audience rows for the classes THEY teach (not other
--          teachers' classes).
--        • ADMINS keep their existing school-wide rights.
--        • Visibility narrows to the announcement's target audience:
--          - school-wide (no audience rows) → everyone in school
--          - per-class → only enrolled students, their parents,
--            the teacher of that class, and admins
--          - the author always sees their own draft regardless
--
-- The legacy `announcements.class_id` column stays nullable — kept
-- to avoid breaking any code that still reads it; new submissions
-- write audience rows instead. The column can be dropped in a later
-- migration once no callers remain.
-- ═══════════════════════════════════════════════════════════════════


-- ─── Audience junction table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_audiences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES public.classes(id)       ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_audiences_announcement
  ON public.announcement_audiences(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_audiences_class
  ON public.announcement_audiences(class_id);

ALTER TABLE public.announcement_audiences ENABLE ROW LEVEL SECURITY;


-- ─── Announcements: drop the admin-only write policies ───────────
DROP POLICY IF EXISTS "Admins can insert announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can update announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can delete announcements" ON public.announcements;
DROP POLICY IF EXISTS "Users can view announcements"   ON public.announcements;


-- ─── Announcements: new visibility policy ────────────────────────
-- A user sees an announcement when (in order):
--   • it has no audience rows AND they're in the school (school-wide), OR
--   • it has at least one audience row matching a class they're in /
--     linked to / teach, OR
--   • they authored it, OR
--   • they're an admin of the school.
CREATE POLICY "Read announcements scoped by audience" ON public.announcements
  FOR SELECT USING (
    school_id = public.auth_school_id()
    AND (
      -- School-wide (no audience rows): visible to every school member.
      NOT EXISTS (
        SELECT 1 FROM public.announcement_audiences aa
         WHERE aa.announcement_id = announcements.id
      )
      -- Per-class audience matching the viewer.
      OR EXISTS (
        SELECT 1 FROM public.announcement_audiences aa
         WHERE aa.announcement_id = announcements.id
           AND (
             aa.class_id IN (
               SELECT class_id FROM public.student_classes
                WHERE student_id = public.auth_profile_id()
             )
             OR aa.class_id IN (
               SELECT sc.class_id FROM public.student_classes sc
                 JOIN public.parent_students ps ON ps.student_id = sc.student_id
                WHERE ps.parent_id = public.auth_profile_id()
             )
             OR aa.class_id IN (
               SELECT class_id FROM public.class_subjects
                WHERE teacher_id = public.auth_profile_id()
             )
           )
      )
      OR author_id = public.auth_profile_id()
      OR public.is_admin()
    )
  );


-- ─── Announcements: INSERT — teachers + admins (school-scoped) ───
CREATE POLICY "Teachers and admins create announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND author_id = public.auth_profile_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );


-- ─── Announcements: UPDATE / DELETE — author or admin ───────────
CREATE POLICY "Author or admin can update announcement" ON public.announcements
  FOR UPDATE USING (
    school_id = public.auth_school_id()
    AND (author_id = public.auth_profile_id() OR public.is_admin())
  );

CREATE POLICY "Author or admin can delete announcement" ON public.announcements
  FOR DELETE USING (
    school_id = public.auth_school_id()
    AND (author_id = public.auth_profile_id() OR public.is_admin())
  );


-- ─── Audience rows: visibility ───────────────────────────────────
-- Audience rows piggy-back on the announcement's own visibility (no
-- one can list audience rows for an announcement they can't see).
CREATE POLICY "Audience visibility follows announcement" ON public.announcement_audiences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.announcements a
       WHERE a.id = announcement_audiences.announcement_id
    )
  );


-- ─── Audience rows: INSERT ───────────────────────────────────────
-- Author can add audience entries only to their own announcement,
-- and a teacher can only target classes they teach. Admins can
-- target any class in their school.
CREATE POLICY "Author can target their own classes" ON public.announcement_audiences
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.announcements a
       WHERE a.id = announcement_audiences.announcement_id
         AND a.school_id = public.auth_school_id()
         AND a.author_id = public.auth_profile_id()
    )
    AND (
      public.is_admin()
      OR class_id IN (
        SELECT class_id FROM public.class_subjects
         WHERE teacher_id = public.auth_profile_id()
      )
    )
  );


-- ─── Audience rows: DELETE ───────────────────────────────────────
CREATE POLICY "Author or admin can remove audience" ON public.announcement_audiences
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.announcements a
       WHERE a.id = announcement_audiences.announcement_id
         AND a.school_id = public.auth_school_id()
         AND (a.author_id = public.auth_profile_id() OR public.is_admin())
    )
  );
