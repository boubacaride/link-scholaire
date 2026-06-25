"use client";

// Admin school-wide attendance oversight.
//
// What it shows for a chosen day:
//   • % of students absent BY GRADE and FOR THE WHOLE SCHOOL,
//     computed with correct denominators (absent / enrolled per group).
//   • A live submission feed: every class in the school with a green /
//     amber pill indicating whether attendance was submitted, plus
//     absentee count and the CSV of absentee names.
//   • Staff totals: % of teachers absent + % of employees absent,
//     with a quick "+ Mark absent" entry to record a staff absence
//     in the new staff_attendance table.
//
// All aggregation is server-side via RPCs from migration 034 —
// no raw row pulls down to the client.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface GradeRow {
  grade: number;
  enrolled: number;
  absent: number;
  late: number;
  excused: number;
  present: number;
  recorded: number;
}

interface ClassRow {
  class_id: string;
  class_name: string;
  grade: number;
  enrolled: number;
  submitted: boolean;
  absent: number;
  late: number;
  excused: number;
  absent_names: string;
}

interface StaffRow {
  role: string;          // 'teacher' | 'employee'
  total_active: number;
  absent: number;
  late: number;
  excused: number;
  present: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const pct = (num: number, denom: number) =>
  denom > 0 ? Math.round((num / denom) * 1000) / 10 : null;     // 1 decimal place

const fmtPct = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)}%`);

const AdminAttendancePage = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";

  const [day, setDay] = useState(todayISO());
  const [grades, setGrades]   = useState<GradeRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [staff, setStaff]     = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Quick-add staff absence form state.
  const [staffList, setStaffList] = useState<{ id: string; name: string; role: string }[]>([]);
  const [absentStaffId, setAbsentStaffId] = useState<string>("");
  const [absentStaffNote, setAbsentStaffNote] = useState<string>("");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    setLoading(true); setErr(null);
    try {
      const [gRes, cRes, sRes] = await Promise.all([
        supabase.rpc("attendance_school_day",  { p_day: day }),
        supabase.rpc("attendance_class_status", { p_day: day }),
        supabase.rpc("staff_attendance_day",   { p_day: day }),
      ]);
      if (gRes.error) throw gRes.error;
      if (cRes.error) throw cRes.error;
      if (sRes.error) throw sRes.error;
      setGrades((gRes.data as GradeRow[]) ?? []);
      setClasses((cRes.data as ClassRow[]) ?? []);
      setStaff((sRes.data as StaffRow[]) ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [day, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // Load the active staff roster once for the "+ mark absent" picker.
  useEffect(() => {
    if (!supabase || !user?.schoolId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("school_id", user.schoolId)
        .in("role", ["teacher", "employee"])
        .eq("is_active", true)
        .order("last_name", { ascending: true });
      setStaffList(
        (data ?? []).map((p: { id: string; first_name: string; last_name: string; role: string }) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          role: p.role,
        })),
      );
    })();
  }, [user?.schoolId]);

  const markStaffAbsent = async () => {
    if (!supabase || !user || !absentStaffId) return;
    const target = staffList.find((s) => s.id === absentStaffId);
    if (!target) return;
    setMarking(true);
    try {
      const { error } = await supabase.from("staff_attendance").upsert({
        school_id: user.schoolId,
        staff_id: target.id,
        role: target.role,
        date: day,
        status: "absent",
        note: absentStaffNote.trim() || null,
        recorded_by: user.profileId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "staff_id,date" });
      if (error) throw error;
      setAbsentStaffId(""); setAbsentStaffNote("");
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMarking(false);
    }
  };

  // Roll-ups derived client-side from the grade rows.
  const schoolTotals = useMemo(() => {
    const e = grades.reduce((acc, g) => acc + g.enrolled, 0);
    const a = grades.reduce((acc, g) => acc + g.absent, 0);
    const l = grades.reduce((acc, g) => acc + g.late, 0);
    const x = grades.reduce((acc, g) => acc + g.excused, 0);
    const p = grades.reduce((acc, g) => acc + g.present, 0);
    const r = grades.reduce((acc, g) => acc + g.recorded, 0);
    return { enrolled: e, absent: a, late: l, excused: x, present: p, recorded: r };
  }, [grades]);

  const submittedClasses = classes.filter((c) => c.submitted).length;

  if (!isAdmin) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          School-wide attendance is admin-only.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Attendance — School Day</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Per-grade + whole-school percentages, live class-submission feed, and staff totals.
            </p>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Day</label>
            <input
              type="date"
              value={day}
              max={todayISO()}
              onChange={(e) => setDay(e.target.value)}
              className="mt-1 text-sm px-3 py-2 rounded-md border border-gray-300"
            />
          </div>
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mt-3">{err}</p>}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Students absent today" value={String(schoolTotals.absent)} hint={`/ ${schoolTotals.enrolled} enrolled`} tone="red" />
        <Stat label="School-wide absence %" value={fmtPct(pct(schoolTotals.absent, schoolTotals.enrolled))} tone="orange" />
        <Stat label="Classes submitted"      value={`${submittedClasses} / ${classes.length}`} tone="emerald" />
        <Stat label="Recorded students"      value={`${schoolTotals.recorded} / ${schoolTotals.enrolled}`} tone="sky" />
      </div>

      {/* Per-grade table */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Per grade</h2>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-6">…</p>
        ) : grades.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No enrolment data for this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="text-left  py-2">Grade</th>
                  <th className="text-right py-2">Enrolled</th>
                  <th className="text-right py-2">Recorded</th>
                  <th className="text-right py-2">Absent</th>
                  <th className="text-right py-2">Late</th>
                  <th className="text-right py-2">Excused</th>
                  <th className="text-right py-2">Absent %</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.grade} className="border-b hover:bg-gray-50">
                    <td className="py-2.5 font-medium">G{g.grade}</td>
                    <td className="py-2.5 text-right">{g.enrolled}</td>
                    <td className="py-2.5 text-right text-gray-500">{g.recorded}</td>
                    <td className="py-2.5 text-right font-mono text-red-700">{g.absent}</td>
                    <td className="py-2.5 text-right font-mono text-amber-700">{g.late}</td>
                    <td className="py-2.5 text-right font-mono text-sky-700">{g.excused}</td>
                    <td className="py-2.5 text-right font-semibold">
                      {fmtPct(pct(g.absent, g.enrolled))}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="py-2.5">School</td>
                  <td className="py-2.5 text-right">{schoolTotals.enrolled}</td>
                  <td className="py-2.5 text-right text-gray-500">{schoolTotals.recorded}</td>
                  <td className="py-2.5 text-right font-mono text-red-700">{schoolTotals.absent}</td>
                  <td className="py-2.5 text-right font-mono text-amber-700">{schoolTotals.late}</td>
                  <td className="py-2.5 text-right font-mono text-sky-700">{schoolTotals.excused}</td>
                  <td className="py-2.5 text-right">
                    {fmtPct(pct(schoolTotals.absent, schoolTotals.enrolled))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live class feed */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Class submissions</h2>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-6">…</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No classes in this school yet.</p>
        ) : (
          <div className="space-y-2">
            {classes.map((c) => (
              <div
                key={c.class_id}
                className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${
                  c.submitted ? "bg-white" : "bg-amber-50/50 border-amber-100"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{c.class_name}</span>
                    <span className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded-full">G{c.grade}</span>
                    {c.submitted ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ submitted</span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⏳ not submitted</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.absent + c.late + c.excused} away · {c.enrolled} enrolled
                  </p>
                  {c.absent > 0 && c.absent_names && (
                    <p className="text-xs text-red-700 mt-1 truncate">
                      Absent: {c.absent_names}
                    </p>
                  )}
                </div>
                <div className="text-right text-[12px] text-gray-600">
                  <div className="font-mono text-red-700">{c.absent}</div>
                  <div className="text-[10px] text-gray-400">absent</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Staff */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Staff today</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {staff.map((r) => (
            <div key={r.role} className="border rounded-lg p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide capitalize">{r.role}s</p>
              <div className="flex items-baseline gap-3 mt-1">
                <p className="text-2xl font-bold text-red-700">{r.absent}</p>
                <p className="text-sm text-gray-500">/ {r.total_active} active</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {fmtPct(pct(r.absent, r.total_active))} absent ·
                {" "}{r.late} late · {r.excused} excused
              </p>
            </div>
          ))}
          {staff.length === 0 && (
            <p className="text-sm text-gray-400 col-span-2">No active staff in this school.</p>
          )}
        </div>

        {/* Quick add */}
        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Record a staff absence
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <select
              value={absentStaffId}
              onChange={(e) => setAbsentStaffId(e.target.value)}
              className="text-sm px-3 py-2 rounded-md border border-gray-300 flex-1 min-w-[200px]"
            >
              <option value="">— Pick staff —</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
            <input
              type="text"
              value={absentStaffNote}
              onChange={(e) => setAbsentStaffNote(e.target.value)}
              placeholder="Optional note"
              className="text-sm px-3 py-2 rounded-md border border-gray-300 flex-1 min-w-[200px]"
            />
            <button
              onClick={markStaffAbsent}
              disabled={marking || !absentStaffId}
              className="text-sm bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 disabled:opacity-40"
            >
              {marking ? "…" : "Mark absent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Small stat card used at the top of the dashboard.
const Stat = ({
  label, value, hint, tone,
}: { label: string; value: string; hint?: string; tone: "red" | "orange" | "emerald" | "sky" }) => {
  const toneClass = {
    red:     "text-red-700",
    orange:  "text-orange-700",
    emerald: "text-emerald-700",
    sky:     "text-sky-700",
  }[tone];
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
};

export default AdminAttendancePage;
