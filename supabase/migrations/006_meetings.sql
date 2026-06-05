-- === MEETINGS / CLASSE VIRTUELLE ===
-- Video meeting module: virtual classrooms, parent-teacher conferences,
-- staff meetings, exam reviews, general meetings. Powered by LiveKit Cloud.
--
-- Conventions mirror migrations 001-005:
--   * uuid_generate_v4() for PKs
--   * CHECK constraints (not Postgres ENUM types)
--   * FKs reference public.profiles(id) -- not auth.users(id) directly
--   * RLS uses helpers from 003: auth_school_id(), auth_profile_id(),
--     auth_role(), is_admin()

-- === TABLES ===

CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  meeting_type TEXT NOT NULL CHECK (meeting_type IN ('virtual_classroom', 'parent_teacher', 'staff', 'exam_review', 'general')),
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_name TEXT UNIQUE NOT NULL DEFAULT ('ls-' || replace(uuid_generate_v4()::text, '-', '')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  timezone TEXT NOT NULL DEFAULT 'Africa/Niamey',
  passcode TEXT,
  waiting_room BOOLEAN NOT NULL DEFAULT TRUE,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_participants INT NOT NULL DEFAULT 100 CHECK (max_participants > 0),
  allow_screen_share TEXT NOT NULL DEFAULT 'host_only' CHECK (allow_screen_share IN ('host_only', 'all', 'none')),
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  meeting_link TEXT GENERATED ALWAYS AS ('https://linkscholaire.com/meet/' || room_name) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_school_scheduled ON public.meetings(school_id, scheduled_at);
CREATE INDEX idx_meetings_host ON public.meetings(host_id);
CREATE INDEX idx_meetings_class ON public.meetings(class_id);
CREATE INDEX idx_meetings_room_name ON public.meetings(room_name);
CREATE INDEX idx_meetings_status ON public.meetings(status);


CREATE TABLE public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'co_host', 'participant', 'observer')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined', 'joined', 'left')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX idx_meeting_participants_meeting ON public.meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_user ON public.meeting_participants(user_id);


CREATE TABLE public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system')),
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meeting_messages_meeting ON public.meeting_messages(meeting_id, created_at);


CREATE TABLE public.meeting_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  duration_seconds INT,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meeting_recordings_meeting ON public.meeting_recordings(meeting_id);


-- === TRIGGERS / FUNCTIONS ===

-- Touch updated_at on every meeting UPDATE
CREATE OR REPLACE FUNCTION public.set_meetings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.set_meetings_updated_at();


-- When a virtual_classroom meeting is created with a class_id, auto-invite
-- every student enrolled in that class. Skip the host (they aren't a
-- participant -- they're the host).
CREATE OR REPLACE FUNCTION public.auto_invite_class_students()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.meeting_type = 'virtual_classroom' AND NEW.class_id IS NOT NULL THEN
    INSERT INTO public.meeting_participants (meeting_id, user_id, role, status)
    SELECT NEW.id, sc.student_id, 'participant', 'invited'
    FROM public.student_classes sc
    JOIN public.profiles p ON p.id = sc.student_id
    WHERE sc.class_id = NEW.class_id
      AND p.role = 'student'
      AND sc.student_id <> NEW.host_id
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meetings_auto_invite_students
AFTER INSERT ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.auto_invite_class_students();


-- When a participant transitions to 'left', stamp left_at and compute
-- duration_seconds from joined_at.
CREATE OR REPLACE FUNCTION public.set_participant_left()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'left' AND COALESCE(OLD.status, '') <> 'left' THEN
    NEW.left_at = NOW();
    IF NEW.joined_at IS NOT NULL THEN
      NEW.duration_seconds = EXTRACT(EPOCH FROM (NOW() - NEW.joined_at))::INT;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_participants_left
BEFORE UPDATE ON public.meeting_participants
FOR EACH ROW EXECUTE FUNCTION public.set_participant_left();


-- Helper used by RLS policies on meeting_participants / meeting_messages
-- to ask "is the current user the host of this meeting?" without
-- recursing into meeting_participants policies.
CREATE OR REPLACE FUNCTION public.is_meeting_host(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings
    WHERE id = p_meeting_id
      AND host_id = public.auth_profile_id()
  );
$$;

-- Helper: am I a participant (any status) of this meeting?
CREATE OR REPLACE FUNCTION public.is_meeting_participant(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id
      AND user_id = public.auth_profile_id()
  );
$$;


-- === RLS ===

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

-- MEETINGS
CREATE POLICY "Users can view relevant meetings" ON public.meetings
  FOR SELECT USING (
    (school_id = public.auth_school_id() AND public.is_admin())
    OR host_id = public.auth_profile_id()
    OR public.is_meeting_participant(id)
  );

CREATE POLICY "Teachers and admins can create meetings" ON public.meetings
  FOR INSERT WITH CHECK (
    school_id = public.auth_school_id()
    AND host_id = public.auth_profile_id()
    AND public.auth_role() IN ('teacher', 'school_admin', 'platform_admin')
  );

CREATE POLICY "Host or admin can update meeting" ON public.meetings
  FOR UPDATE USING (
    host_id = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

CREATE POLICY "Host or admin can delete meeting" ON public.meetings
  FOR DELETE USING (
    host_id = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );


-- MEETING_PARTICIPANTS
CREATE POLICY "Users can view own or hosted participants" ON public.meeting_participants
  FOR SELECT USING (
    user_id = public.auth_profile_id()
    OR public.is_meeting_host(meeting_id)
    OR public.is_admin()
  );

CREATE POLICY "Host or admin can invite participants" ON public.meeting_participants
  FOR INSERT WITH CHECK (
    public.is_meeting_host(meeting_id)
    OR public.is_admin()
  );

-- Users can update their own participant row (e.g. accept/decline/leave).
-- Hosts can update any row in their meeting (e.g. admit from waiting room,
-- promote to co_host).
CREATE POLICY "User can update own participant row" ON public.meeting_participants
  FOR UPDATE USING (
    user_id = public.auth_profile_id()
    OR public.is_meeting_host(meeting_id)
    OR public.is_admin()
  );

CREATE POLICY "Host or admin can remove participants" ON public.meeting_participants
  FOR DELETE USING (
    public.is_meeting_host(meeting_id)
    OR public.is_admin()
  );


-- MEETING_MESSAGES
CREATE POLICY "Members can view meeting messages" ON public.meeting_messages
  FOR SELECT USING (
    public.is_meeting_host(meeting_id)
    OR public.is_meeting_participant(meeting_id)
    OR public.is_admin()
  );

CREATE POLICY "Members can send messages" ON public.meeting_messages
  FOR INSERT WITH CHECK (
    sender_id = public.auth_profile_id()
    AND (
      public.is_meeting_host(meeting_id)
      OR public.is_meeting_participant(meeting_id)
    )
  );

CREATE POLICY "Sender can delete own messages" ON public.meeting_messages
  FOR DELETE USING (
    sender_id = public.auth_profile_id()
    OR public.is_meeting_host(meeting_id)
    OR public.is_admin()
  );


-- MEETING_RECORDINGS -- recordings are sensitive; host + admin only.
CREATE POLICY "Host or admin can view recordings" ON public.meeting_recordings
  FOR SELECT USING (
    public.is_meeting_host(meeting_id)
    OR public.is_admin()
  );

-- INSERT/DELETE done by service role (Egress callback / cleanup), so no
-- public policy needed. Service role bypasses RLS by default.


-- === STORAGE BUCKETS ===

-- Bucket for chat file attachments. Private; access gated by policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-files', 'meeting-files', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket for session recordings. Private.
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- File-path convention used by the app: <meeting_id>/<...>
-- Members can read attachments for meetings they belong to. Members can
-- upload. Recordings are read-only for host + admin.

DROP POLICY IF EXISTS "Members can read meeting files" ON storage.objects;
CREATE POLICY "Members can read meeting files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meeting-files'
    AND (
      public.is_meeting_host((storage.foldername(name))[1]::uuid)
      OR public.is_meeting_participant((storage.foldername(name))[1]::uuid)
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Members can upload meeting files" ON storage.objects;
CREATE POLICY "Members can upload meeting files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meeting-files'
    AND (
      public.is_meeting_host((storage.foldername(name))[1]::uuid)
      OR public.is_meeting_participant((storage.foldername(name))[1]::uuid)
    )
  );

DROP POLICY IF EXISTS "Host or admin can read recordings" ON storage.objects;
CREATE POLICY "Host or admin can read recordings" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'meeting-recordings'
    AND (
      public.is_meeting_host((storage.foldername(name))[1]::uuid)
      OR public.is_admin()
    )
  );


-- === REALTIME PUBLICATION ===
-- Allow Supabase Realtime to broadcast row changes on these tables so
-- the React useMeetingRealtime hook can subscribe to live updates.
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
