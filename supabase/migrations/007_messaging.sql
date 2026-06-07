-- === DIRECT MESSAGING ===
-- One-to-one messaging between members of a school: teachers <-> students,
-- teachers <-> parents, and so on. A "conversation" is simply the set of
-- messages exchanged between two profiles; there is no separate thread row.
--
-- Conventions mirror migrations 001-006:
--   * uuid_generate_v4() for PKs
--   * CHECK constraints (not Postgres ENUM types)
--   * FKs reference public.profiles(id)
--   * RLS uses helpers from 003: auth_school_id(), auth_profile_id(),
--     auth_role(), is_admin()

-- === TABLE ===

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX idx_messages_sender ON public.messages(sender_id, created_at);
CREATE INDEX idx_messages_recipient ON public.messages(recipient_id, created_at);
CREATE INDEX idx_messages_pair ON public.messages(sender_id, recipient_id, created_at);
CREATE INDEX idx_messages_unread ON public.messages(recipient_id, is_read);

-- === RLS ===

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- A user sees a message only if they are one of the two parties (or an admin
-- of the school for moderation/oversight).
CREATE POLICY "Users can view own messages" ON public.messages
  FOR SELECT USING (
    sender_id = public.auth_profile_id()
    OR recipient_id = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

-- A user can only send as themselves, to a recipient inside the same school.
CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = public.auth_profile_id()
    AND school_id = public.auth_school_id()
    AND recipient_id IN (
      SELECT id FROM public.profiles WHERE school_id = public.auth_school_id()
    )
  );

-- The recipient can update a message (used to flag it as read). Sender can
-- also update (e.g. future edit) but the app only toggles is_read on receipt.
CREATE POLICY "Recipient can update message" ON public.messages
  FOR UPDATE USING (
    recipient_id = public.auth_profile_id()
    OR sender_id = public.auth_profile_id()
  );

-- A user can delete their own sent messages.
CREATE POLICY "Sender can delete own message" ON public.messages
  FOR DELETE USING (
    sender_id = public.auth_profile_id()
    OR (school_id = public.auth_school_id() AND public.is_admin())
  );

-- === REALTIME ===
-- Broadcast row changes so the messaging UI can update live.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
