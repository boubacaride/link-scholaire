"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMeeting } from "@/hooks/useMeeting";

const t = {
  pageTitle: "Salle d'attente",
  loading: "Chargement de la session...",
  notFound: "Session introuvable",
  back: "Retour au tableau de bord",
  hostedBy: "Animée par",
  startsAt: "Début prévu",
  join: "Rejoindre la session",
  joining: "Connexion...",
  waitingForHost: "En attente d'approbation de l'hôte...",
  cameraOn: "Caméra activée",
  cameraOff: "Caméra désactivée",
  micOn: "Micro activé",
  micOff: "Micro désactivé",
};

interface LobbyMeeting {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  waiting_room: boolean;
  host: { first_name: string; last_name: string } | null;
}

const LobbyPage = () => {
  const { roomName } = useParams<{ roomName: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { joinMeeting } = useMeeting();

  const [meeting, setMeeting] = useState<LobbyMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    if (authLoading || !roomName || !user) return;
    const supabase = createClient();
    if (!supabase) return;

    supabase
      .from("meetings")
      .select("id, title, scheduled_at, status, waiting_room, host:host_id(first_name, last_name)")
      .eq("room_name", roomName)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoading(false);
          return;
        }
        setMeeting(data as unknown as LobbyMeeting);
        setLoading(false);
      });
  }, [roomName, user, authLoading]);

  const handleJoin = async () => {
    if (!meeting) return;
    setJoining(true);
    setWaiting(false);

    try {
      const connection = await joinMeeting(meeting.id);
      sessionStorage.setItem(
        `meet:${roomName}`,
        JSON.stringify({ ...connection, camOn, micOn }),
      );
      router.push(`/meet/${roomName}`);
    } catch (err) {
      const error = err as Error & { code?: string; status?: number };
      if (error.code === "waiting_for_host") {
        setWaiting(true);
        toast.info(t.waitingForHost);
      } else {
        toast.error(error.message || "Échec de la connexion");
      }
      setJoining(false);
    }
  };

  // Poll while in waiting room — when host admits us, status flips and we retry.
  useEffect(() => {
    if (!waiting || !meeting) return;
    const interval = setInterval(handleJoin, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, meeting]);

  if (loading || authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-300">{t.loading}</div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg">{t.notFound}</p>
        <button
          onClick={() => router.push("/list/classe-virtuelle")}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> {t.back}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-6 px-4">
      <button
        onClick={() => router.push("/list/classe-virtuelle")}
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> {t.back}
      </button>

      <div className="flex w-full flex-col items-center gap-6 md:flex-row md:items-stretch">
        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-gray-800 md:w-2/3">
          {camOn ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Video className="h-12 w-12" />
              <span className="text-xs">{t.cameraOn}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <VideoOff className="h-12 w-12" />
              <span className="text-xs">{t.cameraOff}</span>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-4 rounded-xl bg-gray-900 p-5 md:w-1/3">
          <div>
            <h1 className="text-xl font-semibold">{meeting.title}</h1>
            {meeting.host && (
              <p className="mt-1 text-sm text-gray-400">
                {t.hostedBy} {meeting.host.first_name} {meeting.host.last_name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Calendar className="h-4 w-4 text-gray-500" />
            {new Date(meeting.scheduled_at).toLocaleString("fr-FR", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-gray-800 pt-4">
            <ToggleButton
              active={micOn}
              onClick={() => setMicOn(!micOn)}
              labelOn={t.micOn}
              labelOff={t.micOff}
              IconOn={Mic}
              IconOff={MicOff}
            />
            <ToggleButton
              active={camOn}
              onClick={() => setCamOn(!camOn)}
              labelOn={t.cameraOn}
              labelOff={t.cameraOff}
              IconOn={Video}
              IconOff={VideoOff}
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={joining || waiting}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {waiting ? t.waitingForHost : joining ? t.joining : t.join}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  labelOn: string;
  labelOff: string;
  IconOn: typeof Mic;
  IconOff: typeof MicOff;
}

const ToggleButton = ({ active, onClick, labelOn, labelOff, IconOn, IconOff }: ToggleButtonProps) => {
  const Icon = active ? IconOn : IconOff;
  return (
    <button
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
        active ? "bg-gray-800 hover:bg-gray-700" : "bg-red-600 hover:bg-red-700"
      }`}
      aria-label={active ? labelOn : labelOff}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};

export default LobbyPage;
