"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Meeting,
  MeetingMessage,
  MeetingParticipant,
  MeetingStatus,
} from "@/types/meeting";

export interface ParticipantWithProfile extends MeetingParticipant {
  profile?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    role: string;
  };
}

interface RealtimeState {
  participants: ParticipantWithProfile[];
  messages: MeetingMessage[];
  meetingStatus: MeetingStatus | null;
  loading: boolean;
}

// Subscribe to participants, messages, and meeting status for one meeting.
// Mirrors the pattern: initial fetch on mount, postgres_changes subscription
// for live updates, cleanup on unmount.
export function useMeetingRealtime(meetingId: string | null): RealtimeState {
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meetingId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // ─── Initial fetch ───
    const init = async () => {
      const [{ data: p }, { data: m }, { data: meeting }] = await Promise.all([
        supabase
          .from("meeting_participants")
          .select(
            "*, profile:user_id(id, first_name, last_name, avatar_url, role)",
          )
          .eq("meeting_id", meetingId),
        supabase
          .from("meeting_messages")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("created_at", { ascending: true }),
        supabase
          .from("meetings")
          .select("status")
          .eq("id", meetingId)
          .single(),
      ]);

      if (cancelled) return;
      setParticipants((p as ParticipantWithProfile[]) || []);
      setMessages((m as MeetingMessage[]) || []);
      setMeetingStatus(((meeting as Meeting | null)?.status as MeetingStatus) ?? null);
      setLoading(false);
    };

    init();

    // ─── Subscriptions ───
    const channel = supabase
      .channel(`meeting:${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_participants",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setParticipants((prev) => [...prev, payload.new as ParticipantWithProfile]);
          } else if (payload.eventType === "UPDATE") {
            setParticipants((prev) =>
              prev.map((p) =>
                p.id === (payload.new as MeetingParticipant).id
                  ? { ...p, ...(payload.new as MeetingParticipant) }
                  : p,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setParticipants((prev) =>
              prev.filter((p) => p.id !== (payload.old as MeetingParticipant).id),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_messages",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as MeetingMessage]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "meetings",
          filter: `id=eq.${meetingId}`,
        },
        (payload) => {
          setMeetingStatus((payload.new as Meeting).status);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [meetingId]);

  return { participants, messages, meetingStatus, loading };
}
