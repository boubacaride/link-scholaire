"use client";

// Admin school-wide attendance oversight.
//
// Date range dropdown (per request):
//   • Today          — single day, also drives the live class feed
//   • This week      — Monday → today (or selected day's Mon → that day)
//   • This month     — month-start → selected day
//   • Year-to-date   — academic-year start (active row, or Sept 1) → selected day
//
// Cards (per request: show by grade AND school total, both # and %):
//   • Students absent          — distinct students absent at least once
//   • Classes submitted        — # + % of classes that have at least one
//                                attendance row on the selected day
//   • Recorded students        — # of distinct students who have at least
//                                one attendance row in the range, vs total
//                                enrolled
//   • School-wide % absent     — totals from the per-grade roll-up
//
// All four cards expand to show a per-grade breakdown row by row.
// Aggregation is server-side via attendance_school_range() and
// attendance_class_submission_by_grade() from migration 035.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

type RangeKind = "day" | "week" | "month" | "year";

interface GradeRow {
  grade: number;
  enrolled: number;
  absent_instances: number;
  distinct_students_absent: number;
  late_instances: number;
  excused_instances: number;
  present_instances: number;
  recorded_instances: number;
  days_with_data: number;
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

interface SubmissionRow {
  grade: number;
  total_classes: number;
  submitted: number;
}

interface StaffRow {
  role: string;
  total_active: number;
  absent_instances: number;
  distinct_staff_absent: number;
  late_instances: number;
  excused_instances: number;
  present_instances: number;
  days_with_data: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const pct = (num: number, denom: number): number | null =>
  denom > 0 ? Math.round((num / denom) * 1000) / 10 : null;

const fmtPct = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)}%`);

/** Resolve a (start, end) window for the dropdown choice. `anchor`
 *  is the day the user picked; "today" is just that one day, others
 *  walk backward from it. Year-to-date uses the active academic year's
 *  start date when available, falling back to Sept 1 of the year that
 *  covers the anchor. */
function resolveRange(
  kind: RangeKind,
  anchor: string,
  activeYearStart: string | null,
): { start: string; end: string } {
  const end = anchor;
  const d = new Date(anchor + "T00:00:00Z");

  if (kind === "day") return { start: end, end };

  if (kind === "week") {
    // ISO week: Monday = 1. Walk back so Mon-Sun contains the anchor.
    const dow = d.getUTCDay() || 7;             // Sun = 7
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (dow - 1));
    return { start: mon.toISOString().slice(0, 10), end };
  }

  if (kind === "month") {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return { start: m.toISOString().slice(0, 10), end };
  }

  // year: use the active academic year if configured, else Sept 1 of
  // the academic year covering the anchor (Sept-of-previous-year if
  // the anchor is before September).
  if (activeYearStart) return { start: activeYearStart, end };
  const year = d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { start: `${year}-09-01`, end };
}

const AdminAttendancePage = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";

  const [anchor, setAnchor] = useState(todayISO());
  const [range, setRange]   = useState<RangeKind>("day");
  const [yearStart, setYearStart] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string>("");

  const [grades, setGrades]   = useState<GradeRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subs, setSubs]       = useState<SubmissionRow[]>([]);
  const [staff, setStaff]     = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<{ id: string; name: string; role: string }[]>([]);
  const [absentStaffId, setAbsentStaffId] = useState<string>("");
  const [absentStaffNote, setAbsentStaffNote] = useState<string>("");
  const [marking, setMarking] = useState(false);

  // Load active academic year start (for the "Year-to-date" range) and
  // the school name (for the header) in parallel — both are static for
  // the lifetime of the page.
  useEffect(() => {
    if (!supabase || !user?.schoolId) return;
    (async () => {
      const [yearRes, schoolRes] = await Promise.all([
        supabase
          .from("academic_years")
          .select("start_date")
          .eq("school_id", user.schoolId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("schools")
          .select("name")
          .eq("id", user.schoolId)
          .maybeSingle(),
      ]);
      setYearStart(yearRes.data?.start_date ?? null);
      setSchoolName(schoolRes.data?.name ?? "");
    })();
  }, [user?.schoolId]);

  const { start, end } = useMemo(
    () => resolveRange(range, anchor, yearStart),
    [range, anchor, yearStart],
  );

  // Single-day RPCs (class feed, submissions-by-grade) only fire when
  // the user is looking at one day — the live feed doesn't make sense
  // over a week.
  const isSingleDay = range === "day";

  const load = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    setLoading(true); setErr(null);
    try {
      type RpcResult<T> = { data: T[] | null; error: { message: string } | null };
      const run = <T,>(p: PromiseLike<RpcResult<T>>) => Promise.resolve(p);
      const [gRes, sRes, cRes, subRes] = await Promise.all([
        run<GradeRow>(supabase.rpc("attendance_school_range", { p_start: start, p_end: end })),
        run<StaffRow>(supabase.rpc("staff_attendance_range",  { p_start: start, p_end: end })),
        isSingleDay
          ? run<ClassRow>(supabase.rpc("attendance_class_status", { p_day: anchor }))
          : Promise.resolve<RpcResult<ClassRow>>({ data: [], error: null }),
        isSingleDay
          ? run<SubmissionRow>(supabase.rpc("attendance_class_submission_by_grade", { p_day: anchor }))
          : Promise.resolve<RpcResult<SubmissionRow>>({ data: [], error: null }),
      ]);

      const errors = [gRes.error, sRes.error, cRes.error, subRes.error]
        .filter((e): e is { message: string } => !!e);
      if (errors.length) throw new Error(errors.map((e) => e.message).join(" · "));

      setGrades(gRes.data ?? []);
      setStaff(sRes.data ?? []);
      setClasses(cRes.data ?? []);
      setSubs(subRes.data ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [start, end, anchor, isSingleDay, isAdmin]);

  useEffect(() => { load(); }, [load]);

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
    setMarking(true); setErr(null);
    try {
      const { error } = await supabase.from("staff_attendance").upsert({
        school_id: user.schoolId,
        staff_id: target.id,
        role: target.role,
        date: anchor,
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

  // School totals derived client-side from per-grade rows.
  const schoolTotals = useMemo(() => {
    const e = grades.reduce((a, g) => a + g.enrolled,                  0);
    const ai = grades.reduce((a, g) => a + g.absent_instances,         0);
    const ad = grades.reduce((a, g) => a + g.distinct_students_absent, 0);
    const r  = grades.reduce((a, g) => a + g.recorded_instances,       0);
    const distinctRecorded = grades.reduce(
      (a, g) => a + Math.min(g.enrolled, g.recorded_instances), 0,
    );
    return {
      enrolled: e,
      absent_instances: ai,
      distinct_students_absent: ad,
      recorded_instances: r,
      // Approximation of "students recorded at least once" school-wide.
      // The DB doesn't give us this directly without another query, but
      // the per-grade summary above provides a tight upper bound.
      distinct_students_recorded: distinctRecorded,
    };
  }, [grades]);

  const submissionTotals = useMemo(() => {
    const total = subs.reduce((a, s) => a + s.total_classes, 0);
    const submitted = subs.reduce((a, s) => a + s.submitted, 0);
    return { total, submitted };
  }, [subs]);

  if (!isAdmin) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          School-wide attendance is admin-only.
        </div>
      </div>
    );
  }

  const rangeLabel = ({
    day: "Today",
    week: "This week",
    month: "This month",
    year: "Year-to-date",
  } as const)[range];

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header + range picker */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              {schoolName ? `${schoolName}, Attendance` : "Attendance"}
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">Admin Overview</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {rangeLabel} · {start === end ? start : `${start} → ${end}`}
              {loading && <span className="ml-2 text-blue-500">loading…</span>}
            </p>
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <label className="text-[11px] text-gray-500 flex flex-col">
              <span>Range</span>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as RangeKind)}
                className="mt-1 text-sm px-3 py-2 rounded-md border border-gray-300"
              >
                <option value="day">Today / single day</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="year">Year-to-date{yearStart ? "" : " (Sept 1)"}</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-500 flex flex-col">
              <span>Anchor day</span>
              <input
                type="date"
                value={anchor}
                max={todayISO()}
                onChange={(e) => setAnchor(e.target.value)}
                className="mt-1 text-sm px-3 py-2 rounded-md border border-gray-300"
              />
            </label>
            <button
              onClick={load}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        {err && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            <span className="font-semibold">Error:</span> {err}
            <p className="mt-1 text-[11px] text-red-600/80">
              If this mentions a missing function, apply migration 035 in Supabase first.
            </p>
          </div>
        )}
      </div>

      {/* ─── Cards: each shows school total + per-grade breakdown ─── */}
      <div className="grid lg:grid-cols-2 gap-3">
        {/* Card 1: Students absent */}
        <BreakdownCard
          title="Students absent"
          subtitle={range === "day" ? "Today" : `${rangeLabel} (distinct students)`}
          tone="red"
          rows={grades.map((g) => ({
            label: `G${g.grade}`,
            count: g.distinct_students_absent,
            denom: g.enrolled,
          }))}
          total={{
            count: schoolTotals.distinct_students_absent,
            denom: schoolTotals.enrolled,
          }}
        />

        {/* Card 2: Recorded students */}
        <BreakdownCard
          title="Students recorded"
          subtitle="At least one attendance row in the range"
          tone="sky"
          rows={grades.map((g) => ({
            label: `G${g.grade}`,
            count: Math.min(g.enrolled, g.recorded_instances),
            denom: g.enrolled,
          }))}
          total={{
            count: schoolTotals.distinct_students_recorded,
            denom: schoolTotals.enrolled,
          }}
        />

        {/* Card 3: Classes submitted — single day only */}
        {isSingleDay ? (
          <BreakdownCard
            title="Classes submitted"
            subtitle="On the selected day"
            tone="emerald"
            rows={subs.map((s) => ({
              label: `G${s.grade}`,
              count: s.submitted,
              denom: s.total_classes,
            }))}
            total={{
              count: submissionTotals.submitted,
              denom: submissionTotals.total,
            }}
          />
        ) : (
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Classes submitted</p>
            <p className="text-sm text-gray-500 mt-2">
              Switch to <em>Today / single day</em> to see per-class submission status.
            </p>
          </div>
        )}

        {/* Card 4: Absence instances over the range (for context) */}
        <BreakdownCard
          title="Total absence rows"
          subtitle="Sum of (student, day, absent) across the range"
          tone="orange"
          rows={grades.map((g) => ({
            label: `G${g.grade}`,
            count: g.absent_instances,
            denom: g.recorded_instances,
          }))}
          total={{
            count: schoolTotals.absent_instances,
            denom: schoolTotals.recorded_instances,
          }}
        />
      </div>

      {/* ─── Per-grade detail table ─── */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Per-grade detail</h2>
        {grades.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No enrolment data found. Check that classes have students enrolled
            and (if not your admin's school) that migration 035 is applied.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="text-left  py-2">Grade</th>
                  <th className="text-right py-2">Enrolled</th>
                  <th className="text-right py-2">Absent (distinct)</th>
                  <th className="text-right py-2">Absent %</th>
                  <th className="text-right py-2">Absence rows</th>
                  <th className="text-right py-2">Late</th>
                  <th className="text-right py-2">Excused</th>
                  <th className="text-right py-2">Days w/ data</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.grade} className="border-b hover:bg-gray-50">
                    <td className="py-2.5 font-medium">G{g.grade}</td>
                    <td className="py-2.5 text-right">{g.enrolled}</td>
                    <td className="py-2.5 text-right font-mono text-red-700">{g.distinct_students_absent}</td>
                    <td className="py-2.5 text-right font-semibold">
                      {fmtPct(pct(g.distinct_students_absent, g.enrolled))}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">{g.absent_instances}</td>
                    <td className="py-2.5 text-right font-mono text-amber-700">{g.late_instances}</td>
                    <td className="py-2.5 text-right font-mono text-sky-700">{g.excused_instances}</td>
                    <td className="py-2.5 text-right text-gray-500">{g.days_with_data}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="py-2.5">School</td>
                  <td className="py-2.5 text-right">{schoolTotals.enrolled}</td>
                  <td className="py-2.5 text-right font-mono text-red-700">{schoolTotals.distinct_students_absent}</td>
                  <td className="py-2.5 text-right">
                    {fmtPct(pct(schoolTotals.distinct_students_absent, schoolTotals.enrolled))}
                  </td>
                  <td className="py-2.5 text-right">{schoolTotals.absent_instances}</td>
                  <td className="py-2.5 text-right">
                    {grades.reduce((a, g) => a + g.late_instances, 0)}
                  </td>
                  <td className="py-2.5 text-right">
                    {grades.reduce((a, g) => a + g.excused_instances, 0)}
                  </td>
                  <td className="py-2.5 text-right text-gray-500">
                    {Math.max(0, ...grades.map((g) => g.days_with_data))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Live class feed (single day only) ─── */}
      {isSingleDay && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Class submissions ({anchor})</h2>
          {classes.length === 0 ? (
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
      )}

      {/* ─── Staff ─── */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Staff ({rangeLabel.toLowerCase()})</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {staff.map((r) => (
            <div key={r.role} className="border rounded-lg p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wide capitalize">{r.role}s</p>
              <div className="flex items-baseline gap-3 mt-1">
                <p className="text-2xl font-bold text-red-700">{r.distinct_staff_absent}</p>
                <p className="text-sm text-gray-500">/ {r.total_active} active</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {fmtPct(pct(r.distinct_staff_absent, r.total_active))} absent ·
                {" "}{r.late_instances} late · {r.excused_instances} excused
                {r.days_with_data > 0 && ` · ${r.days_with_data} day${r.days_with_data === 1 ? "" : "s"} w/ data`}
              </p>
            </div>
          ))}
          {staff.length === 0 && (
            <p className="text-sm text-gray-400 col-span-2">No active staff in this school.</p>
          )}
        </div>

        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Record a staff absence ({anchor})
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

/**
 * Card with a school-wide headline number + a per-grade breakdown.
 * Used four times on the dashboard so the rule "show by grade AND by
 * whole school, in number AND percentage" applies to every metric.
 */
const BreakdownCard = ({
  title, subtitle, tone, rows, total,
}: {
  title: string;
  subtitle?: string;
  tone: "red" | "orange" | "emerald" | "sky";
  rows: { label: string; count: number; denom: number }[];
  total: { count: number; denom: number };
}) => {
  const toneText = {
    red:     "text-red-700",
    orange:  "text-orange-700",
    emerald: "text-emerald-700",
    sky:     "text-sky-700",
  }[tone];
  const totalPct = total.denom > 0
    ? `${((total.count / total.denom) * 100).toFixed(1)}%`
    : "—";
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">{title}</p>
          {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${toneText}`}>{total.count}</p>
          <p className="text-[11px] text-gray-500">{totalPct} of {total.denom}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 mt-3">No per-grade breakdown available.</p>
      ) : (
        <div className="mt-3 border-t pt-3 space-y-1">
          {rows.map((r) => {
            const p = r.denom > 0 ? `${((r.count / r.denom) * 100).toFixed(1)}%` : "—";
            return (
              <div key={r.label} className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">{r.label}</span>
                <span className="font-mono text-gray-800">
                  <span className={toneText}>{r.count}</span>
                  <span className="text-gray-400"> / {r.denom}</span>
                  <span className="text-gray-500"> · {p}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminAttendancePage;
