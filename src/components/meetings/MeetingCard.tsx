"use client";

import { Calendar, Clock, Copy, Link2, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { MeetingType } from "@/types/meeting";
import type { MeetingListItem } from "@/hooks/useMeeting";

const t = {
  joinNow: "Rejoindre",
  copyLink: "Copier le lien",
  cancel: "Annuler",
  recording: "Enregistrement",
  inProgress: "En direct",
  participants: "participants",
};

const TYPE_LABEL: Record<MeetingType, string> = {
  virtual_classroom: "Classe virtuelle",
  parent_teacher: "Parents-Enseignants",
  staff: "Personnel",
  exam_review: "Révision examen",
  general: "Général",
};

const TYPE_BADGE: Record<MeetingType, string> = {
  virtual_classroom: "bg-blue-100 text-blue-700",
  parent_teacher: "bg-purple-100 text-purple-700",
  staff: "bg-amber-100 text-amber-700",
  exam_review: "bg-rose-100 text-rose-700",
  general: "bg-gray-100 text-gray-700",
};

const formatRelativeOrAbsolute = (iso: string, variant: Variant): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (variant === "live") {
    if (diffMin <= 0 && absMin < 60) return `Démarré il y a ${absMin} min`;
    return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }
  if (variant === "upcoming") {
    if (diffMin > 0 && diffMin < 60) return `Dans ${diffMin} min`;
    if (diffMin >= 60 && diffMin < 24 * 60) return `Dans ${Math.round(diffMin / 60)} h`;
    return date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  }
  return date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
};

type Variant = "upcoming" | "live" | "past";

interface MeetingCardProps {
  meeting: MeetingListItem;
  variant: Variant;
  canCancel?: boolean;
  onJoin?: () => void;
  onCancel?: () => void;
}

const MeetingCard = ({ meeting, variant, canCancel, onJoin, onCancel }: MeetingCardProps) => {
  const host = meeting.host;
  const startsAt = meeting.started_at ?? meeting.scheduled_at;
  const minutesUntil = Math.round((new Date(meeting.scheduled_at).getTime() - Date.now()) / 60000);
  const canJoin = variant === "live" || (variant === "upcoming" && minutesUntil <= 15);

  const copyLink = () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/meet/${meeting.room_name}/lobby`
        : meeting.meeting_link;
    navigator.clipboard.writeText(url);
    toast.success("Lien copié");
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-emerald-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[meeting.meeting_type]}`}
            >
              {TYPE_LABEL[meeting.meeting_type]}
            </span>
            {variant === "live" && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
                </span>
                {t.inProgress}
              </span>
            )}
            {meeting.recording_enabled && variant !== "past" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <Video className="h-3 w-3" /> {t.recording}
              </span>
            )}
          </div>
          <h3 className="truncate text-base font-semibold text-gray-900">{meeting.title}</h3>
          {meeting.description && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{meeting.description}</p>
          )}
        </div>
        {canCancel && variant !== "past" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label={t.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-gray-400" />
          {formatRelativeOrAbsolute(startsAt, variant)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-gray-400" />
          {variant === "past" && meeting.ended_at && meeting.started_at
            ? `${Math.max(1, Math.round((new Date(meeting.ended_at).getTime() - new Date(meeting.started_at).getTime()) / 60000))} min`
            : `${meeting.duration_minutes} min`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-4 w-4 text-gray-400" />
          {meeting.participant_count} {t.participants}
        </span>
      </div>

      {host && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
              {host.first_name?.[0]}
              {host.last_name?.[0]}
            </div>
            <span>
              {host.first_name} {host.last_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Copy className="h-3.5 w-3.5" /> {t.copyLink}
            </button>
            {variant !== "past" && (
              <button
                type="button"
                onClick={onJoin}
                disabled={!canJoin}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  canJoin
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "cursor-not-allowed bg-gray-100 text-gray-400"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" /> {t.joinNow}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingCard;
