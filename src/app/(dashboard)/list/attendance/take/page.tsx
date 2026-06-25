"use client";

// Teacher attendance recording screen. Pick a class + a date, mark
// each student Present / Absent / Late / Excused with an optional
// per-student note, hit Save.
//
// Same-day idempotency + lock: when any attendance row already exists
// for (class, date), the form loads those values and goes into a
// READ-ONLY locked state. The recording stays visible all day so the
// teacher can review who they marked away; next day the date changes,
// the lock lifts, and the roster comes up blank again. Admins
// (school_admin / platform_admin) get an "Override & edit" button so
// genuine mistakes can still be corrected — teachers can't bypass it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

type Status = "present" | "absent" | "late" | "excused";

interface ClassRow { id: string; name: string; grade: number }
interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  institutional_id: string | null;
}

interface RosterRow extends StudentRow {
  status: Status;
  note: string;
  /** Whether this status was loaded from the DB (so we know what to
   *  update vs insert; we just upsert everything either way). */
  persisted: boolean;
}

const STATUS_TONE: Record<Status, string> = {
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  absent:  "bg-red-50 text-red-700 border-red-200",
  late:    "bg-amber-50 text-amber-700 border-amber-200",
  excused: "bg-sky-50 text-sky-700 border-sky-200",
};

const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const TakeAttendancePage = () => {
  const { user } = useAuth();
  const { t: _t } = useI18n();
  const supabase = createClient();

  const canTake = user?.role === "teacher" || user?.role === "school_admin" || user?.role === "platform_admin";
  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";

  const [classes, setClasses]   = useState<ClassRow[]>([]);
  const [classId, setClassId]   = useState<string>("");
  const [date, setDate]         = useState<string>(todayISO());
  const [roster, setRoster]     = useState<RosterRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);
  const [err, setErr]           = useState<string | null>(null);

  // Lock state: true when this (class, date) already has any rows in
  // the DB. The lock can only be temporarily lifted by an admin via the
  // "Override & edit" button; teachers can never bypass it.
  const [isLocked, setIsLocked] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [overrideEdit, setOverrideEdit] = useState(false);

  // Effective editability — the rest of the UI keys off this.
  const editable = !isLocked || overrideEdit;

  // Load the classes the user can take attendance for. Admins see all
  // in the school; teachers see only the ones they teach.
  useEffect(() => {
    if (!supabase || !user) return;
    (async () => {
      if (isAdmin) {
        const { data } = await supabase
          .from("classes")
          .select("id, name, grade")
          .eq("school_id", user.schoolId)
          .order("grade", { ascending: true });
        setClasses(data ?? []);
        setClassId(data?.[0]?.id ?? "");
      } else if (user.role === "teacher") {
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("class_id, classes:class_id(id, name, grade)")
          .eq("teacher_id", user.profileId);
        type Row = { class_id: string; classes: ClassRow | null };
        const rows = ((cs as unknown as Row[]) ?? [])
          .map((r) => r.classes).filter((c): c is ClassRow => c !== null);
        const uniq = Array.from(new Map(rows.map((c) => [c.id, c])).values());
        setClasses(uniq);
        setClassId(uniq[0]?.id ?? "");
      }
    })();
  }, [user?.profileId, user?.role]);

  // Load the roster + any pre-existing attendance for (class, date).
  const loadRoster = useCallback(async () => {
    if (!supabase || !classId || !date) { setRoster([]); return; }
    setLoading(true); setErr(null); setMsg(null);
    setOverrideEdit(false);   // every time class/date changes, re-lock
    try {
      const { data: enrolls, error: eErr } = await supabase
        .from("student_classes")
        .select("student_id, profiles:student_id(id, first_name, last_name, institutional_id)")
        .eq("class_id", classId);
      if (eErr) throw eErr;
      type Row = { student_id: string; profiles: StudentRow | null };
      const students = ((enrolls as unknown as Row[]) ?? [])
        .map((r) => r.profiles).filter((p): p is StudentRow => p !== null);

      const { data: existing } = await supabase
        .from("attendance")
        .select("student_id, status, note, created_at")
        .eq("class_id", classId)
        .eq("date", date);
      type ExistingRow = {
        student_id: string;
        status: Status;
        note: string | null;
        created_at: string | null;
      };
      const existingRows = (existing ?? []) as ExistingRow[];
      const byStudent = new Map(
        existingRows.map((a) => [a.student_id, { status: a.status, note: a.note ?? "" }]),
      );

      // Lock if anything was already recorded for this (class, date).
      const locked = existingRows.length > 0;
      setIsLocked(locked);
      if (locked) {
        // Show the earliest record timestamp so the teacher knows when
        // submission happened. (No `updated_at` on this table yet.)
        const stamps = existingRows
          .map((r) => r.created_at)
          .filter((s): s is string => !!s)
          .sort();
        setSubmittedAt(stamps.length ? stamps[0] : null);
      } else {
        setSubmittedAt(null);
      }

      // Default to Present so a teacher who clicks Save without
      // touching anything records everyone present (matches the spec).
      const rows: RosterRow[] = students
        .map((s) => {
          const prior = byStudent.get(s.id);
          return {
            ...s,
            status: prior?.status ?? "present",
            note: prior?.note ?? "",
            persisted: !!prior,
          };
        })
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
      setRoster(rows);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  const setStatus = (studentId: string, status: Status) => {
    if (!editable) return;
    setRoster((p) => p.map((r) => (r.id === studentId ? { ...r, status } : r)));
  };
  const setNote = (studentId: string, note: string) => {
    if (!editable) return;
    setRoster((p) => p.map((r) => (r.id === studentId ? { ...r, note } : r)));
  };
  const markAll = (status: Status) => {
    if (!editable) return;
    setRoster((p) => p.map((r) => ({ ...r, status })));
  };

  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of roster) c[r.status] += 1;
    return c;
  }, [roster]);

  const save = async () => {
    if (!supabase || !user || !classId || roster.length === 0) return;
    if (!editable) return;
    setSaving(true); setErr(null); setMsg(null);
    try {
      // Upsert keyed on the natural unique (student, class, date).
      const rows = roster.map((r) => ({
        school_id: user.schoolId,
        student_id: r.id,
        class_id: classId,
        date,
        status: r.status,
        note: r.note.trim() || null,
        recorded_by: user.profileId,
      }));
      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,class_id,date" });
      if (error) throw error;
      setMsg(`Saved ${roster.length} attendance ${roster.length === 1 ? "row" : "rows"}.`);
      // After a successful save the form locks again — admins can
      // override once more if needed, teachers are done for the day.
      setRoster((p) => p.map((r) => ({ ...r, persisted: true })));
      setIsLocked(true);
      setOverrideEdit(false);
      setSubmittedAt(new Date().toISOString());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!canTake) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          Only teachers and admins can record attendance.
        </div>
      </div>
    );
  }

  const submittedAtLabel = submittedAt
    ? new Date(submittedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Headline + pickers */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h1 className="text-xl font-semibold text-gray-800">Take Attendance</h1>
        <p className="text-xs text-gray-500 mt-1">
          Defaults to Present for everyone; flip the ones who are absent / late /
          excused, optionally add a note, then Save. Once submitted, the day's
          record is locked and stays visible read-only for the rest of the day.
        </p>
        <div className="mt-4 grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-gray-500">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300"
            >
              {classes.length === 0 && <option value="">— No classes available —</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (G{c.grade})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Date</label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500">Quick actions</label>
            <div className="mt-1 flex gap-1 flex-wrap">
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => markAll(s)}
                  disabled={!editable}
                  className={`text-[11px] px-2 py-1 rounded-md border ${STATUS_TONE[s]} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  All {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lock banner */}
      {isLocked && (
        <div
          className={`rounded-xl border p-4 flex items-start justify-between gap-3 flex-wrap ${
            overrideEdit
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${overrideEdit ? "text-amber-800" : "text-emerald-800"}`}>
              {overrideEdit
                ? "Override mode — edits will overwrite the saved record."
                : `✓ Attendance for ${date} is submitted.`}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {submittedAtLabel
                ? `Last saved ${submittedAtLabel}. `
                : ""}
              {overrideEdit
                ? "Save to commit, or refresh to discard your changes."
                : "Records stay visible read-only until tomorrow."}
            </p>
          </div>
          {isAdmin && !overrideEdit && (
            <button
              onClick={() => setOverrideEdit(true)}
              className="text-xs font-medium bg-amber-600 text-white px-3 py-1.5 rounded-md hover:bg-amber-700"
            >
              Override &amp; edit (admin)
            </button>
          )}
        </div>
      )}

      {/* Roster */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap text-[12px] text-gray-600">
            <span className="text-gray-500">Totals:</span>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <span key={s} className={`px-2 py-0.5 rounded-full border text-[11px] ${STATUS_TONE[s]}`}>
                {STATUS_LABEL[s]}: {counts[s]}
              </span>
            ))}
          </div>
          {editable ? (
            <button
              onClick={save}
              disabled={saving || roster.length === 0}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? "Saving…" : isLocked ? "Save overrides" : "Save Attendance"}
            </button>
          ) : (
            <span className="text-xs text-gray-500 italic">Read-only — already submitted</span>
          )}
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mb-2">{err}</p>}
        {msg && <p className="text-xs text-green-700 bg-green-50 rounded px-3 py-2 mb-2">{msg}</p>}

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading roster…</p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No students enrolled in this class.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="text-left py-2">Student</th>
                  <th className="text-left py-2">ID</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-left py-2 hidden md:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">
                      {r.first_name} {r.last_name}
                      {r.persisted && (
                        <span className="ml-2 text-[10px] text-emerald-600">✓ saved</span>
                      )}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-gray-500">
                      {r.institutional_id || "—"}
                    </td>
                    <td className="py-2.5 text-center">
                      <div className="inline-flex gap-1">
                        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => {
                          const selected = r.status === s;
                          const baseClasses = selected
                            ? STATUS_TONE[s] + " ring-1 ring-offset-1 ring-current"
                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50";
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setStatus(r.id, s)}
                              disabled={!editable}
                              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${baseClasses} ${
                                !editable ? "cursor-not-allowed opacity-80" : ""
                              }`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 hidden md:table-cell">
                      <input
                        type="text"
                        value={r.note}
                        onChange={(e) => setNote(r.id, e.target.value)}
                        readOnly={!editable}
                        placeholder={editable ? "Optional note" : ""}
                        className={`w-full text-[12px] px-2 py-1 border rounded ${
                          editable
                            ? "border-gray-200"
                            : "border-transparent bg-gray-50 text-gray-500"
                        }`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TakeAttendancePage;
