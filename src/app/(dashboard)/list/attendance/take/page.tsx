"use client";

// Teacher attendance recording screen. Pick a class + a date, mark
// each student Present / Absent / Late / Excused with an optional
// per-student note, hit Save.
//
// Idempotent by design: the existing UNIQUE(student_id, class_id,
// date) constraint plus an upsert means re-submitting the same day
// updates the existing rows instead of duplicating them. RLS from
// migration 033 confines writes to classes the teacher actually
// teaches; admins can write any class in their school.

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
  const { t } = useI18n();
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
        .select("student_id, status, note")
        .eq("class_id", classId)
        .eq("date", date);
      const byStudent = new Map(
        (existing ?? []).map((a: { student_id: string; status: Status; note: string | null }) =>
          [a.student_id, { status: a.status, note: a.note ?? "" }],
        ),
      );

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
    setRoster((p) => p.map((r) => (r.id === studentId ? { ...r, status } : r)));
  };
  const setNote = (studentId: string, note: string) => {
    setRoster((p) => p.map((r) => (r.id === studentId ? { ...r, note } : r)));
  };
  const markAll = (status: Status) => {
    setRoster((p) => p.map((r) => ({ ...r, status })));
  };

  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of roster) c[r.status] += 1;
    return c;
  }, [roster]);

  const save = async () => {
    if (!supabase || !user || !classId || roster.length === 0) return;
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
      // Mark everything as persisted so subsequent saves are visibly idempotent.
      setRoster((p) => p.map((r) => ({ ...r, persisted: true })));
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

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Headline + pickers */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h1 className="text-xl font-semibold text-gray-800">Take Attendance</h1>
        <p className="text-xs text-gray-500 mt-1">
          Defaults to Present for everyone; flip the ones who are absent / late /
          excused, optionally add a note, then Save. Re-saving the same day updates
          the existing rows instead of creating duplicates.
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
                  className={`text-[11px] px-2 py-1 rounded-md border ${STATUS_TONE[s]}`}
                >
                  All {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

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
          <button
            onClick={save}
            disabled={saving || roster.length === 0}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Attendance"}
          </button>
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
                        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(r.id, s)}
                            className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                              r.status === s
                                ? STATUS_TONE[s] + " ring-1 ring-offset-1 ring-current"
                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 hidden md:table-cell">
                      <input
                        type="text"
                        value={r.note}
                        onChange={(e) => setNote(r.id, e.target.value)}
                        placeholder="Optional note"
                        className="w-full text-[12px] px-2 py-1 border border-gray-200 rounded"
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
