"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Users, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMeeting } from "@/hooks/useMeeting";
import type {
  CreateMeetingForm,
  MeetingType,
  ScreenSharePolicy,
} from "@/types/meeting";

const t = {
  title: "Planifier une session",
  cancel: "Annuler",
  submit: "Planifier",
  submitting: "Création…",
  meetingTitle: "Titre",
  meetingTitlePlaceholder: "Ex. Cours de mathématiques — Chapitre 5",
  description: "Description (optionnelle)",
  meetingType: "Type",
  classLabel: "Classe",
  classHint: "Tous les élèves de la classe seront invités automatiquement.",
  subjectLabel: "Matière",
  none: "—",
  dateLabel: "Date et heure",
  durationLabel: "Durée",
  waitingRoom: "Salle d'attente",
  waitingRoomHint: "Les participants attendent votre validation pour rejoindre.",
  recording: "Enregistrer la session",
  screenShare: "Partage d'écran",
  screenShareHostOnly: "Hôte uniquement",
  screenShareAll: "Tout le monde",
  screenShareNone: "Désactivé",
  inviteSection: "Invités",
  invitePlaceholder: "Rechercher par nom…",
  noResults: "Aucun résultat",
};

const TYPE_OPTIONS: { value: MeetingType; label: string }[] = [
  { value: "virtual_classroom", label: "Classe virtuelle" },
  { value: "parent_teacher", label: "Conférence parents-enseignants" },
  { value: "staff", label: "Réunion du personnel" },
  { value: "exam_review", label: "Révision d'examen" },
  { value: "general", label: "Général" },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

interface ClassRow {
  id: string;
  name: string;
  grade: string;
}

interface SubjectRow {
  id: string;
  name: string;
}

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface ScheduleMeetingModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const ScheduleMeetingModal = ({ open, onClose, onCreated }: ScheduleMeetingModalProps) => {
  const { user } = useAuth();
  const { createMeeting, loading } = useMeeting();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>("virtual_classroom");
  const [classId, setClassId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [duration, setDuration] = useState<number>(60);
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [recording, setRecording] = useState(false);
  const [screenShare, setScreenShare] = useState<ScreenSharePolicy>("host_only");
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    const supabase = createClient();
    if (!supabase) return;

    supabase
      .from("classes")
      .select("id, name, grade")
      .eq("school_id", user.schoolId)
      .order("grade")
      .then(({ data }) => setClasses((data as ClassRow[]) || []));

    supabase
      .from("subjects")
      .select("id, name")
      .eq("school_id", user.schoolId)
      .order("name")
      .then(({ data }) => setSubjects((data as SubjectRow[]) || []));

    supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("school_id", user.schoolId)
      .neq("id", user.profileId)
      .order("last_name")
      .then(({ data }) => setProfiles((data as ProfileRow[]) || []));
  }, [open, user]);

  // Default scheduled_at to "now + 15 min" rounded to the next 5 min
  useEffect(() => {
    if (!open) return;
    const d = new Date(Date.now() + 15 * 60_000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setScheduledAt(local);
  }, [open]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 8);
    return profiles
      .filter((p) =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [profiles, search]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setMeetingType("virtual_classroom");
    setClassId("");
    setSubjectId("");
    setDuration(60);
    setWaitingRoom(true);
    setRecording(false);
    setScreenShare("host_only");
    setInviteeIds([]);
    setSearch("");
  };

  const toggleInvitee = (id: string) => {
    setInviteeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Le titre est requis.");
      return;
    }
    const scheduledDate = new Date(scheduledAt);
    if (!scheduledAt || scheduledDate.getTime() < Date.now() - 60_000) {
      toast.error("La date doit être dans le futur.");
      return;
    }
    if (meetingType === "virtual_classroom" && !classId) {
      toast.error("Sélectionnez une classe pour la classe virtuelle.");
      return;
    }

    const form: CreateMeetingForm = {
      title: title.trim(),
      description: description.trim() || undefined,
      meeting_type: meetingType,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: duration,
      waiting_room: waitingRoom,
      recording_enabled: recording,
      allow_screen_share: screenShare,
      class_id: classId || null,
      subject_id: subjectId || null,
      invitee_profile_ids: inviteeIds,
    };

    const created = await createMeeting(form);
    if (!created) {
      toast.error("Échec de la création.");
      return;
    }

    const localLink = `${window.location.origin}/meet/${created.room_name}/lobby`;
    toast.success("Session planifiée", {
      description: localLink,
      action: {
        label: "Copier le lien",
        onClick: () => navigator.clipboard.writeText(localLink),
      },
    });

    reset();
    onCreated?.();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 px-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{t.title}</h2>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t.meetingTitle}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.meetingTitlePlaceholder}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
          </Field>

          <Field label={t.description}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.meetingType}>
              <select
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value as MeetingType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            {meetingType === "virtual_classroom" && (
              <Field label={t.classLabel}>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                >
                  <option value="">{t.none}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grade} — {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={t.subjectLabel}>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">{t.none}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t.dateLabel}>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              />
            </Field>

            <Field label={t.durationLabel}>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t.screenShare}>
              <select
                value={screenShare}
                onChange={(e) => setScreenShare(e.target.value as ScreenSharePolicy)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="host_only">{t.screenShareHostOnly}</option>
                <option value="all">{t.screenShareAll}</option>
                <option value="none">{t.screenShareNone}</option>
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <ToggleField label={t.waitingRoom} checked={waitingRoom} onChange={setWaitingRoom} />
            <ToggleField label={t.recording} checked={recording} onChange={setRecording} />
          </div>

          {meetingType === "virtual_classroom" ? (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
              {t.classHint}
            </p>
          ) : (
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Users className="h-4 w-4 text-gray-400" /> {t.inviteSection}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.invitePlaceholder}
                className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {filteredProfiles.length === 0 && (
                  <p className="px-2 py-1 text-xs text-gray-400">{t.noResults}</p>
                )}
                {filteredProfiles.map((p) => {
                  const checked = inviteeIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-gray-50 ${checked ? "bg-emerald-50" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInvitee(p.id)}
                          className="accent-emerald-600"
                        />
                        {p.first_name} {p.last_name}
                      </span>
                      <span className="text-xs text-gray-400">{p.role}</span>
                    </label>
                  );
                })}
              </div>
              {inviteeIds.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {inviteeIds.length} invité{inviteeIds.length > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Calendar className="h-4 w-4" />
              {loading ? t.submitting : t.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
);

const ToggleField = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-emerald-600"
    />
    {label}
  </label>
);

export default ScheduleMeetingModal;
