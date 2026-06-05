"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMeeting } from "@/hooks/useMeeting";
import MeetingRoom from "@/components/meetings/MeetingRoom";
import type { MeetingConnectionDetails } from "@/types/meeting";

type StoredConnection = MeetingConnectionDetails & {
  camOn?: boolean;
  micOn?: boolean;
};

const MeetingRoomPage = () => {
  const { roomName } = useParams<{ roomName: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { joinMeeting } = useMeeting();

  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [connection, setConnection] = useState<StoredConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !roomName || !user) return;

    const stored = sessionStorage.getItem(`meet:${roomName}`);
    if (stored) {
      try {
        setConnection(JSON.parse(stored) as StoredConnection);
      } catch {
        sessionStorage.removeItem(`meet:${roomName}`);
      }
    }

    const supabase = createClient();
    if (!supabase) return;

    supabase
      .from("meetings")
      .select("id")
      .eq("room_name", roomName)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError("Session introuvable");
          return;
        }
        setMeetingId(data.id);
        if (!stored) {
          // Direct navigation without going through the lobby — fetch a token now.
          joinMeeting(data.id)
            .then((c) => setConnection({ ...c, camOn: true, micOn: true }))
            .catch(() => router.push(`/meet/${roomName}/lobby`));
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, user, authLoading]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <p className="text-lg">{error}</p>
          <button
            onClick={() => router.push("/list/classe-virtuelle")}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-sm text-gray-900"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  if (!connection || !meetingId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-300">Connexion à la session...</div>
      </div>
    );
  }

  return (
    <MeetingRoom
      meetingId={meetingId}
      roomName={roomName as string}
      connection={connection}
      initialCamOn={connection.camOn ?? true}
      initialMicOn={connection.micOn ?? true}
    />
  );
};

export default MeetingRoomPage;
