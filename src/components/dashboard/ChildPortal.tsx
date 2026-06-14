"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AttendanceRing, EmptyHint, gradeColor, gradeBg } from "./PortalUI";

interface ChildPortalProps {
  studentId: string;
  studentName: string;
}

interface GradeRow {
  id: string;
  subject_id: string;
  subject_name: string;
  exam_type: string;
  score: number;
  max_score: number;
  term: string;
  remarks: string | null;
  created_at: string;
}
interface Att { id: string; date: string; status: string; }
interface Homework { id: string; title: string; due_date: string | null; subject_name: string; }

/* ── grade helpers ──────────────────────────────────────────────────── */
const letterGrade = (p: number) =>
  p >= 93 ? "A" : p >= 90 ? "A-" : p >= 87 ? "B+" : p >= 83 ? "B" : p >= 80 ? "B-" :
  p >= 77 ? "C+" : p >= 73 ? "C" : p >= 70 ? "C-" : p >= 67 ? "D+" : p >= 63 ? "D" :
  p >= 60 ? "D-" : "F";
const fmt = (p: number) => `${p.toFixed(2)} - ${letterGrade(p)}`;
const shortDate = (d: string) =>
  d ? new Date(d).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";

const ALL = "__all";

/** Order reporting periods sensibly: quarters (Q1–Q4), then Term 1…Final,
 *  then anything else alphabetically. */
const periodRank = (t: string) => {
  const q = /^q\s*([1-4])$/i.exec(t.trim());
  if (q) return Number(q[1]);
  const m: Record<string, number> = {
    "term 1": 1, "term 2": 2, "term 3": 3, "term 4": 4, final: 5,
    "semester 1": 1, "semester 2": 2,
  };
  return m[t.trim().toLowerCase()] ?? 99;
};

/**
 * ProgressBook-style academic portal for a single child. Two views:
 *  - "home": four cards (Grades, Homework, Grade Details, Daily Attendance)
 *  - "details": per-assignment grade details for one course, with reporting
 *    period (quarter) tabs and a View-By Date/Type toggle.
 * Read-only and RLS-safe (parent reads its own child via is_parent_of).
 */
const ChildPortal = ({ studentId, studentName }: ChildPortalProps) => {
  const supabase = createClient();

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<"home" | "details">("home");
  const [detailCourse, setDetailCourse] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(ALL);
  const [viewBy, setViewBy] = useState<"date" | "type">("date");

  useEffect(() => {
    const load = async () => {
      if (!supabase || !studentId) { setLoading(false); return; }
      setLoading(true);
      setView("home");
      setDetailCourse(null);

      const { data: gradeData } = await supabase
        .from("grades")
        .select("id, subject_id, exam_type, score, max_score, term, remarks, created_at, subject:subject_id(name)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      const gRows: GradeRow[] = (gradeData || []).map((g: any) => ({
        id: g.id, subject_id: g.subject_id, subject_name: g.subject?.name || "Course",
        exam_type: g.exam_type || "Assignment", score: g.score, max_score: g.max_score,
        term: g.term || "—", remarks: g.remarks || null, created_at: g.created_at,
      }));
      setGrades(gRows);

      // Assignments that already have a posted grade are "done" even without a
      // submission row — match by subject + title (grades store the title in
      // exam_type), mirroring the parent overview logic so they don't surface
      // as outstanding homework.
      const gKey = (subjectId: string, title: string) =>
        `${subjectId}|::|${(title || "").trim().toLowerCase()}`;
      const gradedKeys = new Set<string>(
        (gradeData || []).map((g: any) => gKey(g.subject_id, g.exam_type))
      );

      const { data: attData } = await supabase
        .from("attendance")
        .select("id, date, status")
        .eq("student_id", studentId)
        .order("date", { ascending: false });
      setAttendance((attData as Att[]) || []);

      // Homework due today or in the next 2 days
      const { data: enr } = await supabase
        .from("student_classes")
        .select("class_id")
        .eq("student_id", studentId);
      const classIds = (enr || []).map((e: any) => e.class_id);
      if (classIds.length > 0) {
        const { data: content } = await supabase
          .from("content")
          .select("id, title, due_date, type, subject_id, subject:subject_id(name)")
          .in("class_id", classIds)
          .in("type", ["assignment", "classwork"])
          .eq("is_published", true)
          .order("due_date", { ascending: true });
        const contentIds = (content || []).map((c: any) => c.id);
        const submitted = new Set<string>();
        if (contentIds.length > 0) {
          const { data: subs } = await supabase
            .from("submissions")
            .select("content_id, status")
            .eq("student_id", studentId)
            .in("content_id", contentIds);
          (subs || []).forEach((s: any) => { if (s.status !== "pending") submitted.add(s.content_id); });
        }
        // Calendar-day window: from the start of today through the end of the
        // day two days out, so "due today or next 2 days" is inclusive of the
        // whole final day regardless of the current clock time.
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const endOfWindow = new Date(startOfToday);
        endOfWindow.setDate(endOfWindow.getDate() + 2); endOfWindow.setHours(23, 59, 59, 999);
        const windowStart = startOfToday.getTime();
        const windowEnd = endOfWindow.getTime();
        setHomework((content || [])
          .filter((c: any) => c.due_date && !submitted.has(c.id) &&
            !gradedKeys.has(gKey(c.subject_id, c.title)) &&
            new Date(c.due_date).getTime() >= windowStart &&
            new Date(c.due_date).getTime() <= windowEnd)
          .map((c: any) => ({
            id: c.id, title: c.title, due_date: c.due_date, subject_name: c.subject?.name || "",
          })));
      } else {
        setHomework([]);
      }

      setLoading(false);
    };
    load();
  }, [studentId]);

  const pct = (r: GradeRow) => (r.max_score ? (r.score / r.max_score) * 100 : 0);

  // Reporting periods present in the data, ordered.
  const terms = useMemo(() => {
    const set = new Set(grades.map((g) => g.term).filter((t) => t && t !== "—"));
    return Array.from(set).sort((a, b) => periodRank(a) - periodRank(b) || a.localeCompare(b));
  }, [grades]);

  // Default the home + details view to the most recent reporting period.
  const currentPeriod = period !== ALL ? period : (terms[terms.length - 1] ?? ALL);

  const courses = useMemo(() => {
    const m = new Map<string, string>();
    grades.forEach((r) => m.set(r.subject_id, r.subject_name));
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [grades]);

  const inPeriod = (r: GradeRow, p: string) => p === ALL || r.term === p;

  const avgFor = (subjectId: string, p: string): number | null => {
    const rs = grades.filter((r) => r.subject_id === subjectId && inPeriod(r, p));
    if (!rs.length) return null;
    return rs.reduce((s, r) => s + pct(r), 0) / rs.length;
  };

  const lastUpdated = (subjectId: string, p: string) => {
    const rs = grades.filter((r) => r.subject_id === subjectId && inPeriod(r, p));
    return rs.length ? rs[0].created_at : "";
  };

  // Date range covered by a reporting period (derived from its grades).
  const periodRange = (p: string): string => {
    const rs = grades.filter((r) => inPeriod(r, p) && r.created_at);
    if (!rs.length) return "";
    const times = rs.map((r) => new Date(r.created_at).getTime());
    return `${shortDate(new Date(Math.min(...times)).toISOString())} – ${shortDate(new Date(Math.max(...times)).toISOString())}`;
  };

  const attendanceSummary = useMemo(() => {
    const types: { label: string; count: number; tone: string }[] = [];
    const count = (s: string) => attendance.filter((a) => a.status === s).length;
    const absent = count("absent"), late = count("late"), excused = count("excused");
    if (absent) types.push({ label: "Unexcused Absence", count: absent, tone: "text-red-600" });
    if (late) types.push({ label: "Tardy", count: late, tone: "text-amber-600" });
    if (excused) types.push({ label: "Excused Absence", count: excused, tone: "text-sky-600" });
    return types;
  }, [attendance]);

  const attRate = useMemo(() => {
    if (!attendance.length) return null;
    const ok = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    return (ok / attendance.length) * 100;
  }, [attendance]);

  const openDetails = (subjectId: string) => {
    setDetailCourse(subjectId);
    setPeriod(currentPeriod);
    setViewBy("date");
    setView("details");
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading {studentName}&apos;s records…</p>
      </div>
    );
  }

  /* ── GRADE DETAILS VIEW ───────────────────────────────────────────── */
  if (view === "details" && detailCourse) {
    const courseName = courses.find((c) => c.id === detailCourse)?.name || "Course";
    const items = grades.filter((r) => r.subject_id === detailCourse && inPeriod(r, period));
    const classMark = items.length ? items.reduce((s, r) => s + pct(r), 0) / items.length : null;
    const range = periodRange(period);

    const byType = () => {
      const m = new Map<string, GradeRow[]>();
      items.forEach((r) => { const a = m.get(r.exam_type) || []; a.push(r); m.set(r.exam_type, a); });
      return Array.from(m.entries()).map(([type, list]) => ({
        type, list, avg: list.reduce((s, r) => s + pct(r), 0) / list.length,
      }));
    };

    const periodTabs = [{ id: ALL, label: "All" }, ...terms.map((t) => ({ id: t, label: t }))];

    return (
      <PBCard
        title="Grade Details"
        action={
          <button onClick={() => { setView("home"); setPeriod(ALL); }} className="text-white/90 hover:text-white text-xs font-medium">
            ← Back to Home
          </button>
        }
      >
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Main column */}
          <div className="flex-1 min-w-0">
            {/* Class selector + period header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <label className="text-xs text-gray-500">
                <span className="block mb-1 font-semibold uppercase tracking-wide text-[10px]">Class</span>
                <select
                  value={detailCourse}
                  onChange={(e) => setDetailCourse(e.target.value)}
                  className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-700">
                  {period === ALL ? "All reporting periods" : period}
                </p>
                {range && <p className="text-xs text-gray-400">{range}</p>}
              </div>
            </div>

            {/* Title + view-by + class mark */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-3">
              <h4 className="text-base font-bold text-gray-800 uppercase">{courseName}</h4>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                {(["date", "type"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewBy(v)}
                    className={`text-xs px-3 py-1.5 font-medium capitalize transition-colors ${
                      viewBy === v ? "bg-[#1f3a5f] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-right text-sm font-bold text-gray-700 mb-3">
              Class Mark: {classMark === null ? "—" : <span className={gradeColor(classMark)}>{fmt(classMark)}</span>}
            </p>

            {items.length === 0 ? (
              <EmptyHint text="There are no grade details available at this time." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#eef3f7] text-gray-600 text-xs">
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Date</th>
                      <th className="text-left font-semibold px-3 py-2">Assignment</th>
                      <th className="text-left font-semibold px-3 py-2">Type</th>
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Mark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewBy === "date"
                      ? items.map((r) => <DetailRow key={r.id} r={r} pct={pct(r)} />)
                      : byType().map((g) => (
                          <TypeGroup key={g.type} type={g.type} avg={g.avg}>
                            {g.list.map((r) => <DetailRow key={r.id} r={r} pct={pct(r)} hideType />)}
                          </TypeGroup>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reporting-period tabs (Q1–Q4) */}
          {terms.length > 0 && (
            <aside className="lg:w-24 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Periods</p>
              <div className="flex lg:flex-col flex-wrap gap-1.5">
                {periodTabs.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={`text-sm px-3 py-2 rounded-lg font-semibold text-left transition-colors ${
                      period === p.id ? "bg-[#1f3a5f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </aside>
          )}
        </div>
      </PBCard>
    );
  }

  /* ── HOME VIEW (four cards) ───────────────────────────────────────── */
  const recentGraded = grades.slice(0, 6);
  const periodHeading = currentPeriod === ALL ? "all reporting periods" : currentPeriod;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      {/* LEFT — Grades, then Grade Details directly below */}
      <div className="flex flex-col gap-5">
        {/* Grades */}
        <PBCard
          title="Grades"
          badge={`Grades for ${periodHeading}`}
          action={courses.length > 0 ? <DetailsLink onClick={() => openDetails(courses[0].id)} /> : undefined}
        >
          {courses.length === 0 ? (
            <EmptyHint text="No grades have been posted yet." />
          ) : (
            <>
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#eef3f7] text-gray-600 text-xs">
                      <th className="text-left font-semibold px-3 py-2">Course</th>
                      <th className="text-left font-semibold px-3 py-2">Grade</th>
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">As Of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((c) => {
                      const avg = avgFor(c.id, currentPeriod);
                      return (
                        <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => openDetails(c.id)}
                              className="text-left text-[#2f6da3] font-medium hover:text-[#00467f] hover:underline"
                            >
                              {c.name}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            {avg === null ? <span className="text-gray-400">—</span>
                              : <span className={`font-semibold ${gradeColor(avg)}`}>{fmt(avg)}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                            {shortDate(lastUpdated(c.id, currentPeriod))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => openDetails(courses[0].id)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#2f6da3] font-medium hover:text-[#00467f]"
              >
                <SearchIcon /> View all grades
              </button>
            </>
          )}
        </PBCard>

        {/* Grade Details (recent activity) */}
        <PBCard
          title="Grade Details"
          badge="Recent graded work"
          action={courses.length > 0 ? <DetailsLink onClick={() => openDetails(courses[0].id)} /> : undefined}
        >
          {recentGraded.length === 0 ? (
            <EmptyHint text="There are no grade details available at this time." />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {recentGraded.map((r) => {
                  const p = pct(r);
                  return (
                    <div key={r.id} className="flex items-center gap-3 py-2.5">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shrink-0 ${gradeBg(p)}`}>
                        {Math.round(p)}%
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.exam_type}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {r.subject_name}{r.term && r.term !== "—" ? ` • ${r.term}` : ""} • {shortDate(r.created_at)}
                        </p>
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${gradeColor(p)}`}>{r.score}/{r.max_score}</span>
                    </div>
                  );
                })}
              </div>
              {courses.length > 0 && (
                <button
                  onClick={() => openDetails(courses[0].id)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#2f6da3] font-medium hover:text-[#00467f]"
                >
                  <SearchIcon /> View all grade details
                </button>
              )}
            </>
          )}
        </PBCard>
      </div>

      {/* RIGHT — Homework, then Daily Attendance */}
      <div className="flex flex-col gap-5">
        {/* Homework */}
        <PBCard title="Homework" badge="Homework due today or next 2 days">
          {homework.length === 0 ? (
            <EmptyHint text="No homework." />
          ) : (
            <div className="space-y-1.5">
              {homework.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{h.title}</p>
                    <p className="text-[11px] text-gray-400 truncate">{h.subject_name}</p>
                  </div>
                  {h.due_date && (
                    <span className="text-[11px] font-medium text-amber-600 shrink-0">
                      {shortDate(h.due_date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </PBCard>

        {/* Daily Attendance */}
        <PBCard title="Daily Attendance" badge="Absence type summary for the year">
          {attendance.length === 0 ? (
            <EmptyHint text="No attendance records." />
          ) : (
            <div className="flex items-center gap-5">
              <AttendanceRing rate={attRate ?? 0} />
              <div className="flex-1 min-w-0">
                {attendanceSummary.length === 0 ? (
                  <p className="text-sm text-green-600 font-medium">Perfect attendance 🎉</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-gray-100">
                        <th className="text-left font-semibold pb-1.5">Absence Type</th>
                        <th className="text-right font-semibold pb-1.5">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceSummary.map((a) => (
                        <tr key={a.label} className="border-b border-gray-50 last:border-0">
                          <td className={`py-1.5 ${a.tone}`}>{a.label}</td>
                          <td className={`py-1.5 text-right font-bold ${a.tone}`}>{a.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </PBCard>
      </div>
    </div>
  );
};

/* ── small sub-components ────────────────────────────────────────────── */

/** ProgressBook-style dashboard widget: a blue title bar with an optional
 *  right-aligned action ("details" / back), a gray label badge, then content
 *  on a white card with a soft bottom shadow ("one-edge-shadow"). */
const PBCard = ({ title, badge, action, children }: {
  title: string;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="bg-white rounded-md border border-gray-200 shadow-[0_2px_5px_rgba(0,0,0,0.1)] overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a]">
      <h3 className="text-white font-bold text-base leading-none">{title}</h3>
      {action && <div className="leading-none">{action}</div>}
    </div>
    {badge && (
      <div className="px-4 pt-3">
        <span className="inline-block bg-[#6b7785] text-white text-[11px] font-semibold px-2 py-1 rounded">{badge}</span>
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

const DetailsLink = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="text-white/90 hover:text-white text-xs font-medium hover:underline underline-offset-2">
    details
  </button>
);

const DetailRow = ({ r, pct, hideType }: { r: GradeRow; pct: number; hideType?: boolean }) => (
  <tr className="border-t border-gray-100 hover:bg-gray-50 align-top">
    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{shortDate(r.created_at)}</td>
    <td className="px-3 py-2.5">
      <p className="text-gray-800 font-medium">{r.exam_type}</p>
      {r.remarks && <p className="text-[11px] text-purple-600 mt-0.5">{r.remarks}</p>}
    </td>
    <td className="px-3 py-2.5 text-gray-500 text-xs">{hideType ? "" : r.exam_type}</td>
    <td className="px-3 py-2.5 whitespace-nowrap">
      <span className={`font-bold ${gradeColor(pct)}`}>{r.score}/{r.max_score}</span>
      <span className="text-[11px] text-gray-400 ml-1">({Math.round(pct)}%)</span>
    </td>
  </tr>
);

const TypeGroup = ({ type, avg, children }: { type: string; avg: number; children: React.ReactNode }) => (
  <>
    <tr className="bg-gray-50">
      <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">{type}</td>
      <td className="px-3 py-1.5 text-xs font-bold text-right">
        <span className={gradeColor(avg)}>{fmt(avg)}</span>
      </td>
    </tr>
    {children}
  </>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

export default ChildPortal;
