"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMeetingRealtime } from "./useMeetingRealtime";
import type { MeetingMessage } from "@/types/meeting";

export function useMeetingChat(meetingId: string | null) {
  const { user } = useAuth();
  const { messages, loading } = useMeetingRealtime(meetingId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string): Promise<MeetingMessage | null> => {
      if (!meetingId || !user || !content.trim()) return null;
      const supabase = createClient();
      if (!supabase) return null;

      setSending(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("meeting_messages")
        .insert({
          meeting_id: meetingId,
          sender_id: user.profileId,
          content: content.trim(),
          message_type: "text",
        })
        .select()
        .single();

      setSending(false);
      if (err) {
        setError(err.message);
        return null;
      }
      return data as MeetingMessage;
    },
    [meetingId, user],
  );

  const sendFile = useCallback(
    async (file: File): Promise<MeetingMessage | null> => {
      if (!meetingId || !user) return null;
      const supabase = createClient();
      if (!supabase) return null;

      setSending(true);
      setError(null);

      const path = `${meetingId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("meeting-files")
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        setSending(false);
        return null;
      }

      const { data: signed } = await supabase.storage
        .from("meeting-files")
        .createSignedUrl(path, 60 * 60 * 24);

      const { data, error: insertError } = await supabase
        .from("meeting_messages")
        .insert({
          meeting_id: meetingId,
          sender_id: user.profileId,
          content: file.name,
          message_type: "file",
          file_url: signed?.signedUrl ?? path,
        })
        .select()
        .single();

      setSending(false);
      if (insertError) {
        setError(insertError.message);
        return null;
      }
      return data as MeetingMessage;
    },
    [meetingId, user],
  );

  return { messages, loading, sending, error, sendMessage, sendFile };
}
