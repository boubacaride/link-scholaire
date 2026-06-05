"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Radio, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLiveMeetings,
  usePastMeetings,
  useUpcomingMeetings,
  useMeeting,
  type MeetingListItem,
} from "@/hooks/useMeeting";
import MeetingCard from "@/components/meetings/MeetingCard";
import ScheduleMeetingModal from "@/components/meetings/ScheduleMeetingModal";

const t = {
  pageTitle: "Classe Virtuelle",
  subtitle: "Sessions vidéo pour cours, conférences et réunions.",
  scheduleMeeting: "Planifier une session",
  tabUpcoming: "À venir",
  tabLive: "En direct",
  tabPast: "Passées",
  emptyUpcoming: "Aucune session planifiée",
  emptyUpcomingHint: "Cliquez sur \"Planifier une session\" pour démarrer.",
  emptyLive: "Aucune session en cours",
  emptyLiveHint: "Les sessions actives apparaîtront ici.",
  emptyPast: "Aucune session passée",
  emptyPastHint: "L'historique de vos sessions s'affichera ici.",
  loading: "Chargement…",
  cancelConfirm: "Annuler cette session ?",
  cancelled: "Session annulée",
};

type Tab = "upcoming" | "live" | "past";

const TAB_CONFIG: { id: Tab; label: string; icon: typeof Calendar }[] = [
  { id: "upcoming", label: t.tabUpcoming, icon: Calendar },
  { id: "live", label: t.tabLive, icon: Radio },
  { id: "past", label: t.tabPast, icon: Video },
];

const ClasseVirtuellePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const upcoming = useUpcomingMeetings();
  const live = useLiveMeetings();
  const past = usePastMeetings(30);
  const { joinMeeting, cancelMeeting } = useMeeting();

  const role = user?.role;
  const canCreate = role === "teacher" || role === "school_admin" || role === "platform_admin";
  const canAdmin = role === "school_admin" || role === "platform_admin";

  const current = tab === "upcoming" ? upcoming : tab === "live" ? live : past;

  const handleJoin = async (meeting: MeetingListItem) => {
    router.push(`/meet/${meeting.room_name}/lobby`);
    void joinMeeting; // joinMeeting will be invoked from the lobby
  };

  const handleCancel = async (meeting: MeetingListItem) => {
    if (!confirm(t.cancelConfirm)) return;
    await cancelMeeting(meeting.id);
    toast.success(t.cancelled);
    upcoming.refresh();
  };

  return (
    <div className="m-4 mt-0 flex-1">
      <div className="rounded-md bg-white p-4">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t.pageTitle}</h1>
            <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Calendar className="h-4 w-4" />
              {t.scheduleMeeting}
            </button>
          )}
        </div>

        <div className="mb-5 flex items-center gap-1 border-b border-gray-200">
          {TAB_CONFIG.map((c) => {
            const Icon = c.icon;
            const active = tab === c.id;
            const count =
              c.id === "upcoming" ? upcoming.data.length :
              c.id === "live" ? live.data.length :
              past.data.length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setTab(c.id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {c.label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {current.loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
            ))}
          </div>
        ) : current.error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {current.error}
          </div>
        ) : current.data.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {current.data.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                variant={tab}
                canCancel={canAdmin || m.host_id === user?.profileId}
                onJoin={() => handleJoin(m)}
                onCancel={() => handleCancel(m)}
              />
            ))}
          </div>
        )}
      </div>

      <ScheduleMeetingModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onCreated={() => upcoming.refresh()}
      />
    </div>
  );
};

const EmptyState = ({ tab }: { tab: Tab }) => {
  const message =
    tab === "upcoming" ? { title: t.emptyUpcoming, hint: t.emptyUpcomingHint } :
    tab === "live" ? { title: t.emptyLive, hint: t.emptyLiveHint } :
    { title: t.emptyPast, hint: t.emptyPastHint };

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
        <Video className="h-6 w-6 text-emerald-600" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{message.title}</h3>
      <p className="mt-1 text-sm text-gray-500">{message.hint}</p>
    </div>
  );
};

export default ClasseVirtuellePage;
