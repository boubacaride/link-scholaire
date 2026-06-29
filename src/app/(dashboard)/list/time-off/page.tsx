"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import StatusChip from "@/components/timeoff/StatusChip";
import {
  type TimeOffRequest, type CertificationRequest,
  dayCount, formatRange, todayISO,
} from "@/lib/timeoff";

interface Child { id: string; first_name: string; last_name: string; }

const card = "bg-white rounded-xl border shadow-sm";
const primaryBtn = "bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white rounded-md px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-50";
const field = "ring-[1.5px] ring-gray-300 focus:ring-[#4a7eb0] outline-none p-2 rounded-md text-sm w-full";

const TimeOffPage = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();

  const role = user?.role;
  const isStaff = role === "teacher" || role === "employee";
  const isParent = role === "parent";

  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [certs, setCerts] = useState<CertificationRequest[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !user?.profileId) { setLoading(false); return; }
    setLoading(true);
    const { data: to } = await supabase
      .from("time_off_requests")
      .select("*")
      .eq("requester_id", user.profileId)
      .order("created_at", { ascending: false });
    setTimeOff((to as TimeOffRequest[]) || []);

    if (isStaff) {
      const { data: c } = await supabase
        .from("certification_requests")
        .select("*")
        .eq("requester_id", user.profileId)
        .order("created_at", { ascending: false });
      setCerts((c as CertificationRequest[]) || []);
    }

    if (isParent) {
      const { data: links } = await supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", user.profileId);
      const ids = (links || []).map((l: { student_id: string }) => l.student_id);
      if (ids.length) {
        const { data: kids } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", ids);
        setChildren((kids as Child[]) || []);
      }
    }
    setLoading(false);
  }, [supabase, user?.profileId, isStaff, isParent]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className={`${card} p-6`}>
        <h1 className="text-xl font-semibold">
          {(isParent || role === "student") ? t("abs.myRequestTitle") : t("timeoff.myTimeOff")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isParent ? t("timeoff.studentApprovalsSub") : t("timeoff.timeOffRequests")}
        </p>
      </div>

      {toast && (
        <div className="rounded-md bg-emerald-50 text-emerald-800 text-sm px-4 py-2 border border-emerald-200">
          {toast}
        </div>
      )}

      {/* Time-off section */}
      <TimeOffSection
        requests={timeOff}
        children={children}
        isParent={isParent}
        loading={loading}
        onSaved={(m) => { flash(m); load(); }}
      />

      {/* Certification section — staff only */}
      {isStaff && (
        <CertificationSection
          requests={certs}
          loading={loading}
          onSaved={(m) => { flash(m); load(); }}
        />
      )}
    </div>
  );
};

/* ── Time-off section ─────────────────────────────────────────────── */
const TimeOffSection = ({
  requests, children, isParent, loading, onSaved,
}: {
  requests: TimeOffRequest[];
  children: Child[];
  isParent: boolean;
  loading: boolean;
  onSaved: (msg: string) => void;
}) => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [reason, setReason] = useState("");
  // type is required for staff (teachers / employees) per spec; for
  // student requests it stays defaulted to 'personal' since the form
  // doesn't surface the choice to a student/parent.
  const [type, setType] = useState<"vacation" | "sick" | "personal">("personal");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => {
    setSubjectId(""); setStart(todayISO()); setEnd(todayISO());
    setReason(""); setType("personal"); setErr("");
  };

  // Only staff submitters see the Type picker. Parents filing for a
  // student keep the implicit 'personal' value.
  const showTypePicker = !isParent && user?.role !== "student";

  const submit = async () => {
    if (!supabase || !user?.profileId || !user?.schoolId) return;
    const subject = isParent ? subjectId : user.profileId;
    if (isParent && !subject) { setErr(t("timeoff.selectChild")); return; }
    if (end < start) { setErr(t("timeoff.endDate")); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.from("time_off_requests").insert({
      school_id: user.schoolId,
      requester_id: user.profileId,
      subject_id: subject,
      requester_kind: isParent ? "student" : (user.role === "student" ? "student" : "staff"),
      type,
      start_date: start,
      end_date: end,
      reason: reason || null,
      status: "pending",
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); reset();
    onSaved(t("timeoff.submitted"));
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between p-5 border-b">
        <h2 className="font-semibold text-gray-800">{t("timeoff.timeOffRequests")}</h2>
        <button className={primaryBtn} onClick={() => { reset(); setOpen(true); }}>
          + {t("timeoff.newTimeOff")}
        </button>
      </div>

      {open && (
        <div className="p-5 border-b bg-slate-50/60 flex flex-col gap-3">
          {isParent && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              {t("timeoff.requestFor")}
              <select className={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">{t("timeoff.selectChild")}</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </label>
          )}
          {showTypePicker && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              {t("timeoff.type")}
              <select
                className={field}
                value={type}
                onChange={(e) => setType(e.target.value as "vacation" | "sick" | "personal")}
              >
                <option value="personal">{t("timeoff.typePersonal")}</option>
                <option value="sick">{t("timeoff.typeSick")}</option>
                <option value="vacation">{t("timeoff.typeVacation")}</option>
              </select>
              <span className="text-[10px] text-gray-400">{t("timeoff.typeHint")}</span>
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-[150px]">
              {t("timeoff.startDate")}
              <input type="date" className={field} value={start}
                onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-[150px]">
              {t("timeoff.endDate")}
              <input type="date" className={field} value={end} min={start}
                onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-gray-500">{t("timeoff.duration", { n: dayCount(start, end) })}</p>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("timeoff.reasonOptional")}
            <textarea rows={2} className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button className={primaryBtn} disabled={saving} onClick={submit}>
              {saving ? t("timeoff.submitting") : t("timeoff.submit")}
            </button>
            <button className="text-sm px-4 py-2 rounded-md bg-gray-100 text-gray-700" onClick={() => setOpen(false)}>
              {t("timeoff.cancel")}
            </button>
          </div>
        </div>
      )}

      <RequestList
        loading={loading}
        empty={requests.length === 0}
        rows={requests.map((r) => ({
          id: r.id,
          title: formatRange(r.start_date, r.end_date, locale),
          sub: `${t("timeoff.duration", { n: dayCount(r.start_date, r.end_date) })}${r.reason ? ` · ${r.reason}` : ""}`,
          status: r.status,
          note: r.review_note,
        }))}
      />
    </div>
  );
};

/* ── Certification section ────────────────────────────────────────── */
const CertificationSection = ({
  requests, loading, onSaved,
}: {
  requests: CertificationRequest[];
  loading: boolean;
  onSaved: (msg: string) => void;
}) => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => { setName(""); setOrg(""); setStart(""); setEnd(""); setNotes(""); setErr(""); };

  const submit = async () => {
    if (!supabase || !user?.profileId || !user?.schoolId) return;
    if (!name.trim()) { setErr(t("timeoff.certName")); return; }
    if (start && end && end < start) { setErr(t("timeoff.endDate")); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.from("certification_requests").insert({
      school_id: user.schoolId,
      requester_id: user.profileId,
      certification_name: name.trim(),
      issuing_org: org || null,
      start_date: start || null,
      end_date: end || null,
      notes: notes || null,
      status: "pending",
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); reset();
    onSaved(t("timeoff.submitted"));
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between p-5 border-b">
        <h2 className="font-semibold text-gray-800">{t("timeoff.certifications")}</h2>
        <button className={primaryBtn} onClick={() => { reset(); setOpen(true); }}>
          + {t("timeoff.newCertification")}
        </button>
      </div>

      {open && (
        <div className="p-5 border-b bg-slate-50/60 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-[180px]">
              {t("timeoff.certName")}
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-[180px]">
              {t("timeoff.issuingOrgOptional")}
              <input className={field} value={org} onChange={(e) => setOrg(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-[150px]">
              {t("timeoff.startDate")}
              <input type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-[150px]">
              {t("timeoff.endDate")}
              <input type="date" className={field} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {t("timeoff.notesOptional")}
            <textarea rows={2} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button className={primaryBtn} disabled={saving} onClick={submit}>
              {saving ? t("timeoff.submitting") : t("timeoff.submit")}
            </button>
            <button className="text-sm px-4 py-2 rounded-md bg-gray-100 text-gray-700" onClick={() => setOpen(false)}>
              {t("timeoff.cancel")}
            </button>
          </div>
        </div>
      )}

      <RequestList
        loading={loading}
        empty={requests.length === 0}
        rows={requests.map((r) => ({
          id: r.id,
          title: r.certification_name,
          sub: [r.issuing_org, r.start_date && r.end_date ? formatRange(r.start_date, r.end_date, locale) : null]
            .filter(Boolean).join(" · "),
          status: r.status,
          note: r.review_note,
        }))}
      />
    </div>
  );
};

/* ── Shared list ──────────────────────────────────────────────────── */
const RequestList = ({
  loading, empty, rows,
}: {
  loading: boolean;
  empty: boolean;
  rows: { id: string; title: string; sub: string; status: TimeOffRequest["status"]; note: string | null }[];
}) => {
  const { t } = useI18n();
  if (loading) return <div className="p-5 text-sm text-gray-400">{t("ui.loading")}</div>;
  if (empty) return <div className="p-5 text-sm text-gray-400">{t("timeoff.noRequests")}</div>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="font-medium text-gray-800">{r.title}</p>
            {r.sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{r.sub}</p>}
            {r.note && <p className="text-xs text-gray-400 mt-1 italic">“{r.note}”</p>}
          </div>
          <StatusChip status={r.status} />
        </li>
      ))}
    </ul>
  );
};

export default TimeOffPage;
