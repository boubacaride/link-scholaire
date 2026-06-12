"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, EmptyHint, gradeColor, type PanelAccent } from "./PortalUI";

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

const TERM_ORDER = ["Term 1", "Term 2", "Term 3", "Final"];
const ALL = "__all";

/** US-style letter grade from a percentage. */
const letterGrade = (p: number) =>
  p >= 93 ? "A" : p >= 90 ? "A-" : p >= 87 ? "B+" : p >= 83 ? "B" : p >= 80 ? "B-" :
  p >= 77 ? "C+" : p >= 73 ? "C" : p >= 70 ? "C-" : p >= 67 ? "D+" : p >= 63 ? "D" :
  p >= 60 ? "D-" : "F";

const fmt = (p: number) => `${p.toFixed(2)} - ${letterGrade(p)}`;
const shortDate = (d: string) =>
  d ? new Date(d).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";

/** ProgressBook-style Grades experience: course averages per reporting period,
 *  expandable to all periods, drilling into per-assignment Grade Details with a
 *  View By (Date / Type) toggle, a Class dropdown and teacher comments.
 *  Shared by the student (own grades) and parent (child's grades, RLS-safe). */
export default function GradesPortal({
  studentId,
  accent = "indigo",
}: { studentId?: string; accent?: PanelAccent }) {
  const { user } = useAuth();
  const supabase = createClient();
  const targetId = studentId || user?.profileId;

  const [rows, setRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>(ALL);
  const [detailSubject, setDetailSubject] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewBy, setViewBy] = useState<"date" | "type">("date");

  useEffect(() => {
    const load = async () => {
      if (!supabase || !targetId) { setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("grades")
        .select("id, subject_id, exam_type, score, max_score, term, remarks, created_at, subject:subject_id(name)")
        .eq("student_id", targetId)
        .order("created_at", { ascending: false });
      setRows((data || []).map((g: any) => ({
        id: g.id, subject_id: g.subject_id, subject_name: g.subject?.name || "Course",
        exam_type: g.exam_type || "Assignment", score: g.score, max_score: g.max_score,
        term: g.term || "—", remarks: g.remarks || null, created_at: g.created_at,
      })));
      setLoading(false);
    };
    load();
  }, [targetId]);

  const pct = (r: GradeRow) => (r.max_score ? (r.score / r.max_score) * 100 : 0);

  // Available reporting periods (terms), in a sensible order.
  const terms = useMemo(() => {
    const set = new Set(rows.map((r) => r.term).filter((t) => t && t !== "—"));
    const ordered = TERM_ORDER.filter((t) => set.has(t));
    const extras = Array.from(set).filter((t) => !TERM_ORDER.includes(t));
    return [...ordered, ...extras];
  }, [rows]);

  // Courses (subjects).
  const courses = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.subject_id, r.subject_name));
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const avgFor = (subjectId: string, term: string): number | null => {
    const rs = rows.filter((r) => r.subject_id === subjectId && (term === ALL || r.term === term));
    if (!rs.length) return null;
    return rs.reduce((s, r) => s + pct(r), 0) / rs.length;
  };

  const lastUpdated = (subjectId: string, term: string) => {
    const rs = rows.filter((r) => r.subject_id === subjectId && (term === ALL || r.term === term));
    return rs.length ? rs[0].created_at : "";
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const openDetails = (subjectId: string) => { setDetailSubject(subjectId); setViewBy("date"); };

  const periodLabel = period === ALL ? "All reporting periods" : period;

  // ── Reporting-period selector (shared by both screens) ──────────────
  const PeriodPicker = () => (
    <div className="flex flex-wrap gap-1.5">
      {[{ id: ALL, label: "All" }, ...terms.map((t) => ({ id: t, label: t }))].map((p) => (
        <button
          key={p.id}
          onClick={() => setPeriod(p.id)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            period === p.id ? "bg-[#1f3a5f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <Panel title="Grades" icon="📊" accent={accent}>
        <div className="py-10 flex justify-center">
          <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </Panel>
    );
  }

  if (rows.length === 0) {
    return (
      <Panel title="Grades" icon="📊" accent={accent}>
        <EmptyHint text="No grades have been posted yet." />
      </Panel>
    );
  }

  // ── GRADE DETAILS SCREEN ────────────────────────────────────────────
  if (detailSubject) {
    const courseName = courses.find((c) => c.id === detailSubject)?.name || "Course";
    const items = rows.filter(
      (r) => r.subject_id === detailSubject && (period === ALL || r.term === period)
    );

    const byType = () => {
      const m = new Map<string, GradeRow[]>();
      items.forEach((r) => {
        const arr = m.get(r.exam_type) || [];
        arr.push(r);
        m.set(r.exam_type, arr);
      });
      return Array.from(m.entries()).map(([type, list]) => ({
        type,
        list,
        avg: list.reduce((s, r) => s + pct(r), 0) / list.length,
      }));
    };

    const AssignmentRow = ({ r, showType = true }: { r: GradeRow; showType?: boolean }) => {
      const p = pct(r);
      return (
        <div className="py-2.5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shrink-0 ${
              p >= 80 ? "bg-green-500" : p >= 60 ? "bg-blue-500" : p >= 50 ? "bg-orange-500" : "bg-red-500"
            }`}>{Math.round(p)}%</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">
                {showType ? r.exam_type : courseName}
              </p>
              <p className="text-[11px] text-gray-400">
                {shortDate(r.created_at)}{r.term && r.term !== "—" ? ` • ${r.term}` : ""}
              </p>
            </div>
            <span className={`text-sm font-bold shrink-0 ${gradeColor(p)}`}>{r.score}/{r.max_score}</span>
          </div>
          {r.remarks && (
            <div className="mt-1.5 ml-[52px] bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5">
              <p className="text-[10px] text-purple-500 uppercase tracking-wide font-medium">Teacher comment</p>
              <p className="text-xs text-purple-800 mt-0.5">{r.remarks}</p>
            </div>
          )}
        </div>
      );
    };

    return (
      <Panel
        title="Grade Details"
        icon="📊"
        accent={accent}
        action={
          <button onClick={() => setDetailSubject(null)} className="text-xs text-white/90 hover:text-white font-medium">
            ← Back to Grades
          </button>
        }
      >
        {/* Controls: Class dropdown + View By + reporting periods */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-500">
              <span className="block mb-1 font-semibold uppercase tracking-wide text-[10px]">Class</span>
              <select
                value={detailSubject}
                onChange={(e) => setDetailSubject(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div>
              <span className="block mb-1 font-semibold uppercase tracking-wide text-[10px] text-gray-500">View by</span>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                {(["date", "type"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewBy(v)}
                    className={`text-xs px-3 py-2 font-medium capitalize transition-colors ${
                      viewBy === v ? "bg-[#1f3a5f] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <span className="block mb-1 font-semibold uppercase tracking-wide text-[10px] text-gray-500">Reporting period</span>
            <PeriodPicker />
          </div>
        </div>

        <h4 className="text-sm font-bold text-gray-800 mb-1">{courseName}</h4>
        <p className="text-xs text-gray-400 mb-3">{periodLabel}</p>

        {items.length === 0 ? (
          <EmptyHint text="There are no grade details available at this time." />
        ) : viewBy === "date" ? (
          <div className="divide-y divide-gray-100">
            {items.map((r) => <AssignmentRow key={r.id} r={r} />)}
          </div>
        ) : (
          <div className="space-y-4">
            {byType().map((g) => (
              <div key={g.type}>
                <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 mb-1">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{g.type}</span>
                  <span className={`text-xs font-bold ${gradeColor(g.avg)}`}>{fmt(g.avg)}</span>
                </div>
                <div className="divide-y divide-gray-100 px-1">
                  {g.list.map((r) => <AssignmentRow key={r.id} r={r} showType={false} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    );
  }

  // ── GRADES SCREEN (course averages) ─────────────────────────────────
  return (
    <Panel title="Grades" icon="📊" accent={accent}
      action={<span className="text-[11px] text-white/80">{periodLabel}</span>}>
      <div className="flex flex-col md:flex-row gap-4">
        {/* Course averages table */}
        <div className="flex-1 min-w-0">
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#eef3f7] text-gray-600 text-xs">
                  <th className="text-left font-semibold px-3 py-2 w-6"></th>
                  <th className="text-left font-semibold px-2 py-2">Course</th>
                  <th className="text-left font-semibold px-3 py-2">Grade</th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">As Of</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const avg = avgFor(c.id, period);
                  const isOpen = expanded.has(c.id);
                  return (
                    <FragmentRow
                      key={c.id}
                      course={c}
                      avg={avg}
                      isOpen={isOpen}
                      asOf={lastUpdated(c.id, period)}
                      onToggle={() => toggleExpand(c.id)}
                      onOpen={() => openDetails(c.id)}
                      terms={terms}
                      avgForTerm={(t) => avgFor(c.id, t)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => openDetails(courses[0].id)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-700"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            See all grade details
          </button>
        </div>

        {/* Reporting periods */}
        <aside className="md:w-44 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Reporting periods</p>
          <div className="flex md:flex-col flex-wrap gap-1.5">
            <PeriodChip label="All periods" active={period === ALL} onClick={() => setPeriod(ALL)} />
            {terms.map((t) => (
              <PeriodChip key={t} label={t} active={period === t} onClick={() => setPeriod(t)} />
            ))}
          </div>
        </aside>
      </div>
    </Panel>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const FragmentRow = ({
  course, avg, isOpen, asOf, onToggle, onOpen, terms, avgForTerm,
}: {
  course: { id: string; name: string };
  avg: number | null;
  isOpen: boolean;
  asOf: string;
  onToggle: () => void;
  onOpen: () => void;
  terms: string[];
  avgForTerm: (term: string) => number | null;
}) => (
  <>
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2.5 align-top">
        <button
          onClick={onToggle}
          aria-label={isOpen ? "Collapse" : "Expand reporting periods"}
          aria-expanded={isOpen}
          className="text-gray-400 hover:text-gray-700"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </td>
      <td className="px-2 py-2.5">
        <button onClick={onOpen} className="text-left text-indigo-600 font-medium hover:text-indigo-700 hover:underline">
          {course.name}
        </button>
      </td>
      <td className="px-3 py-2.5">
        {avg === null
          ? <span className="text-gray-400">—</span>
          : <span className={`font-semibold ${gradeColor(avg)}`}>{fmt(avg)}</span>}
      </td>
      <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
        {asOf ? shortDate(asOf) : "—"}
      </td>
    </tr>
    {isOpen && (
      <tr className="bg-gray-50/60">
        <td></td>
        <td colSpan={3} className="px-2 pb-3 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {terms.map((t) => {
              const a = avgForTerm(t);
              return (
                <div key={t} className="bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <p className="text-[10px] text-gray-400">{t}</p>
                  <p className={`text-sm font-bold ${a === null ? "text-gray-300" : gradeColor(a)}`}>
                    {a === null ? "—" : fmt(a)}
                  </p>
                </div>
              );
            })}
          </div>
        </td>
      </tr>
    )}
  </>
);

const PeriodChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`text-xs px-3 py-1.5 rounded-lg font-medium text-left transition-colors ${
      active ? "bg-[#1f3a5f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`}
  >
    {label}
  </button>
);
