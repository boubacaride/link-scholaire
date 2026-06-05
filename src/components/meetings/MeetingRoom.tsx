"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  ControlBar,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { MessageSquare, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useMeeting } from "@/hooks/useMeeting";
import type { MeetingConnectionDetails } from "@/types/meeting";
import ChatSidebar from "./ChatSidebar";
import ParticipantsSidebar from "./ParticipantsSidebar";

interface MeetingRoomProps {
  meetingId: string;
  roomName: string;
  connection: MeetingConnectionDetails;
  initialCamOn: boolean;
  initialMicOn: boolean;
}

const t = {
  ended: "Session terminée",
  duration: "Durée",
  returnHome: "Retour au tableau de bord",
};

const MeetingRoom = ({ meetingId, roomName, connection, initialCamOn, initialMicOn }: MeetingRoomProps) => {
  const router = useRouter();
  const { user } = useAuth();
  const { endMeeting } = useMeeting();
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [startedAt] = useState(Date.now());

  const handleDisconnected = useCallback(() => {
    setHasEnded(true);
  }, []);

  const handleEnd = useCallback(async () => {
    if (connection.isHost) {
      await endMeeting(meetingId);
      toast.success("Session terminée");
    }
    setHasEnded(true);
  }, [connection.isHost, endMeeting, meetingId]);

  if (hasEnded) {
    const durationMin = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">{t.ended}</h1>
        <p className="text-gray-400">
          {t.duration}: {durationMin} min
        </p>
        <button
          onClick={() => router.push("/list/classe-virtuelle")}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {t.returnHome}
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.url}
      connect
      video={initialCamOn}
      audio={initialMicOn}
      onDisconnected={handleDisconnected}
      data-lk-theme="default"
      className="flex h-full flex-col"
    >
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <VideoStage />
          <CustomControlBar
            isHost={connection.isHost}
            chatOpen={chatOpen}
            participantsOpen={participantsOpen}
            onToggleChat={() => {
              setChatOpen((v) => !v);
              setParticipantsOpen(false);
            }}
            onToggleParticipants={() => {
              setParticipantsOpen((v) => !v);
              setChatOpen(false);
            }}
            onEnd={handleEnd}
          />
        </div>

        {chatOpen && (
          <SidebarShell title="Discussion" onClose={() => setChatOpen(false)}>
            <ChatSidebar meetingId={meetingId} senderProfileId={user?.profileId ?? ""} />
          </SidebarShell>
        )}

        {participantsOpen && (
          <SidebarShell title="Participants" onClose={() => setParticipantsOpen(false)}>
            <ParticipantsSidebar
              meetingId={meetingId}
              isHost={connection.isHost}
              currentProfileId={user?.profileId ?? ""}
            />
          </SidebarShell>
        )}
      </div>

      <RoomAudioRenderer />
    </LiveKitRoom>
  );
};

const VideoStage = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="flex-1 overflow-hidden bg-gray-900 p-2">
      <GridLayout tracks={tracks} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
};

interface CustomControlBarProps {
  isHost: boolean;
  chatOpen: boolean;
  participantsOpen: boolean;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onEnd: () => void;
}

const CustomControlBar = ({
  isHost,
  chatOpen,
  participantsOpen,
  onToggleChat,
  onToggleParticipants,
  onEnd,
}: CustomControlBarProps) => {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-gray-800 bg-gray-950 px-4 py-3">
      <div className="flex items-center gap-2">
        <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: true, leave: false }} />
      </div>
      <div className="flex items-center gap-2">
        <ToggleIconButton
          active={chatOpen}
          onClick={onToggleChat}
          aria-label="Discussion"
        >
          <MessageSquare className="h-4 w-4" />
        </ToggleIconButton>
        <ToggleIconButton
          active={participantsOpen}
          onClick={onToggleParticipants}
          aria-label="Participants"
        >
          <Users className="h-4 w-4" />
        </ToggleIconButton>
        <button
          onClick={onEnd}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          {isHost ? "Terminer" : "Quitter"}
        </button>
      </div>
    </div>
  );
};

const ToggleIconButton = ({
  active,
  onClick,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    onClick={onClick}
    {...rest}
    className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
      active ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"
    }`}
  >
    {children}
  </button>
);

const SidebarShell = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l border-gray-800 bg-gray-950 md:relative md:w-80">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
};

export default MeetingRoom;
