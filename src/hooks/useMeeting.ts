"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  CreateMeetingForm,
  Meeting,
  MeetingConnectionDetails,
  MeetingParticipant,
} from "@/types/meeting";

const MEETING_COLUMNS =
  "id, school_id, title, description, meeting_type, host_id, room_name, scheduled_at, duration_minutes, timezone, passcode, waiting_room, recording_enabled, max_participants, allow_screen_share, class_id, subject_id, status, started_at, ended_at, meeting_link, created_at, updated_at";

export interface MeetingListItem extends Meeting {
  host: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
  participant_count: number;
}

interface RawMeetingRow extends Meeting {
  host: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
  meeting_participants: { count: number }[];
}

const withCounts = (rows: RawMeetingRow[] | null): MeetingListItem[] =>
  (rows || []).map(({ meeting_participants, ...rest }) => ({
    ...rest,
    participant_count: meeting_participants?.[0]?.count ?? 0,
  }));

// ─── Action hook ─────────────────────────────────────────────────────

export function useMeeting() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMeeting = useCallback(
    async (form: CreateMeetingForm): Promise<Meeting | null> => {
      const supabase = createClient();
      if (!supabase || !user) return null;
      setLoading(true);
      setError(null);

      const { invitee_profile_ids, ...meetingFields } = form;

      const { data: meeting, error: insertError } = await supabase
        .from("meetings")
        .insert({
          ...meetingFields,
          school_id: user.schoolId,
          host_id: user.profileId,
        })
        .select(MEETING_COLUMNS)
        .single();

      if (insertError || !meeting) {
        setError(insertError?.message ?? "Failed to create meeting.");
        setLoading(false);
        return null;
      }

      if (invitee_profile_ids?.length) {
        const rows = invitee_profile_ids
          .filter((id) => id !== user.profileId)
          .map((id) => ({
            meeting_id: meeting.id,
            user_id: id,
            role: "participant" as const,
            status: "invited" as const,
          }));

        if (rows.length) {
          await supabase
            .from("meeting_participants")
            .upsert(rows, { onConflict: "meeting_id,user_id" });
        }
      }

      setLoading(false);
      return meeting as Meeting;
    },
    [user],
  );

  const joinMeeting = useCallback(
    async (meetingId: string): Promise<MeetingConnectionDetails> => {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/meetings/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      setLoading(false);

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = payload.error ?? `Join failed (${res.status})`;
        setError(message);
        const err = new Error(message) as Error & { code?: string; status?: number };
        err.code = payload.error;
        err.status = res.status;
        throw err;
      }

      return (await res.json()) as MeetingConnectionDetails;
    },
    [],
  );

  const endMeeting = useCallback(async (meetingId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    const { error: err } = await supabase
      .from("meetings")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", meetingId);
    if (err) setError(err.message);
  }, []);

  const cancelMeeting = useCallback(async (meetingId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    const { error: err } = await supabase
      .from("meetings")
      .update({ status: "cancelled" })
      .eq("id", meetingId);
    if (err) setError(err.message);
  }, []);

  const updateMeeting = useCallback(
    async (meetingId: string, updates: Partial<Meeting>) => {
      const supabase = createClient();
      if (!supabase) return null;
      const { data, error: err } = await supabase
        .from("meetings")
        .update(updates)
        .eq("id", meetingId)
        .select(MEETING_COLUMNS)
        .single();
      if (err) {
        setError(err.message);
        return null;
      }
      return data as Meeting;
    },
    [],
  );

  const admitParticipant = useCallback(
    async (meetingId: string, profileId: string) => {
      const supabase = createClient();
      if (!supabase) return;
      const { error: err } = await supabase
        .from("meeting_participants")
        .update({ status: "accepted" })
        .eq("meeting_id", meetingId)
        .eq("user_id", profileId);
      if (err) setError(err.message);
    },
    [],
  );

  const removeParticipant = useCallback(
    async (meetingId: string, profileId: string) => {
      const supabase = createClient();
      if (!supabase) return;
      const { error: err } = await supabase
        .from("meeting_participants")
        .delete()
        .eq("meeting_id", meetingId)
        .eq("user_id", profileId);
      if (err) setError(err.message);
    },
    [],
  );

  return {
    loading,
    error,
    createMeeting,
    joinMeeting,
    endMeeting,
    cancelMeeting,
    updateMeeting,
    admitParticipant,
    removeParticipant,
  };
}

// ─── List hooks ──────────────────────────────────────────────────────

const buildListQuery = (filterStatus: "upcoming" | "live" | "past") => {
  // Returns a query-builder configuration applied below
  return filterStatus;
};

function useMeetingsBy(filterStatus: "upcoming" | "live" | "past", limit?: number) {
  const [data, setData] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const select = `${MEETING_COLUMNS}, host:host_id(id, first_name, last_name, avatar_url), meeting_participants(count)`;
    let query = supabase.from("meetings").select(select);

    if (filterStatus === "upcoming") {
      query = query.eq("status", "scheduled").order("scheduled_at", { ascending: true });
    } else if (filterStatus === "live") {
      query = query.eq("status", "live").order("started_at", { ascending: false });
    } else {
      query = query.in("status", ["ended", "cancelled"]).order("scheduled_at", { ascending: false });
    }

    if (limit) query = query.limit(limit);

    query.then(({ data: rows, error: err }) => {
      if (err) setError(err.message);
      else setData(withCounts(rows as unknown as RawMeetingRow[] | null));
      setLoading(false);
    });
  }, [filterStatus, limit, refreshKey]);

  return { data, loading, error, refresh };
}

export const useUpcomingMeetings = () => useMeetingsBy("upcoming");
export const useLiveMeetings = () => useMeetingsBy("live");
export const usePastMeetings = (limit = 50) => useMeetingsBy("past", limit);

// ─── Single meeting hook (with participant list) ─────────────────────

export interface MeetingDetail extends Meeting {
  host: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
  participants: (MeetingParticipant & {
    profile: { id: string; first_name: string; last_name: string; avatar_url: string | null; role: string };
  })[];
}

export function useMeetingById(meetingId: string | null) {
  const [data, setData] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

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
    setLoading(true);

    const select = `${MEETING_COLUMNS}, host:host_id(id, first_name, last_name, avatar_url), participants:meeting_participants(*, profile:user_id(id, first_name, last_name, avatar_url, role))`;

    supabase
      .from("meetings")
      .select(select)
      .eq("id", meetingId)
      .single()
      .then(({ data: row, error: err }) => {
        if (err) setError(err.message);
        else setData(row as unknown as MeetingDetail);
        setLoading(false);
      });
  }, [meetingId, refreshKey]);

  return { data, loading, error, refresh };
}
