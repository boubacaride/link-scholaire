"use client";

import { Check, UserMinus, UserPlus } from "lucide-react";
import { useMeetingRealtime } from "@/hooks/useMeetingRealtime";
import { useMeeting } from "@/hooks/useMeeting";
import { useI18n } from "@/contexts/LanguageContext";
import { toast } from "sonner";

const STATUS_LABEL_KEY: Record<string, string> = {
  invited: "labs.statusInvited",
  accepted: "labs.statusAccepted",
  declined: "labs.statusDeclined",
  joined: "labs.statusJoined",
  left: "labs.statusLeft",
};

interface ParticipantsSidebarProps {
  meetingId: string;
  isHost: boolean;
  currentProfileId: string;
}

const ParticipantsSidebar = ({ meetingId, isHost, currentProfileId }: ParticipantsSidebarProps) => {
  const { t } = useI18n();
  const { participants, loading } = useMeetingRealtime(meetingId);
  const { admitParticipant, removeParticipant } = useMeeting();

  const waiting = participants.filter(
    (p) => p.status === "invited" && p.user_id !== currentProfileId,
  );
  const others = participants.filter((p) => p.status !== "invited");

  const handleAdmit = async (id: string) => {
    await admitParticipant(meetingId, id);
    toast.success(t("labs.psAdmitted"));
  };

  const handleRemove = async (id: string) => {
    await removeParticipant(meetingId, id);
    toast.success(t("labs.psRemoved"));
  };

  if (loading) {
    return <div className="px-4 py-3 text-xs text-gray-500">{t("labs.psLoading")}</div>;
  }

  return (
    <div className="px-3 py-3">
      {isHost && waiting.length > 0 && (
        <section className="mb-4">
          <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
            {t("labs.psWaiting", { n: waiting.length })}
          </h3>
          <ul className="flex flex-col gap-1">
            {waiting.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-amber-900/20 p-2"
              >
                <ParticipantInfo participant={p} t={t} />
                <div className="flex gap-1">
                  <button
                    onClick={() => handleAdmit(p.user_id)}
                    className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    aria-label={t("labs.psAdmit")}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemove(p.user_id)}
                    className="flex h-7 w-7 items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
                    aria-label={t("labs.psDecline")}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("labs.psParticipants", { n: others.length })}
        </h3>
        <ul className="flex flex-col gap-1">
          {others.length === 0 && (
            <li className="px-1 py-2 text-xs text-gray-500">{t("labs.psNoParticipants")}</li>
          )}
          {others.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-gray-800"
            >
              <ParticipantInfo participant={p} t={t} />
              {isHost && p.user_id !== currentProfileId && (
                <button
                  onClick={() => handleRemove(p.user_id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-700 hover:text-white"
                  aria-label={t("labs.psRemove")}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

const ParticipantInfo = ({
  participant,
  t,
}: {
  participant: ReturnType<typeof useMeetingRealtime>["participants"][number];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) => {
  const profile = participant.profile;
  const name = profile
    ? `${profile.first_name} ${profile.last_name}`
    : participant.user_id.slice(0, 8);
  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`
    : "?";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-white">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-100">{name}</p>
        <p className="text-xs text-gray-500">
          {STATUS_LABEL_KEY[participant.status] ? t(STATUS_LABEL_KEY[participant.status]) : participant.status}
        </p>
      </div>
    </div>
  );
};

export default ParticipantsSidebar;
