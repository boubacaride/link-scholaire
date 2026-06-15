"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { EmptyHint, PBCard, DetailsLink, gradeColor, type PanelAccent } from "./PortalUI";

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

interface Course { id: string; name: string; }

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

const letterGrade = (p: number) =>
  p >= 93 ? "A" : p >= 90 ? "A-" : p >= 87 ? "B+" : p >= 83 ? "B" : p >= 80 ? "B-" :
  p >= 77 ? "C+" : p >= 73 ? "C" : p >= 70 ? "C-" : p >= 67 ? "D+" : p >= 63 ? "D" :
  p >= 60 ? "D-" : "F";

const fmt = (p: number) => `${p.toFixed(2)} - ${letterGrade(p)}`;
const shortDate = (d: string) =>
  d ? new Date(d).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";

/**
 * ProgressBook-style Grades page for a single student. Right-side vertical
 * Q1–Q4 tabs select a reporting period; the main area lists every enrolled
 * course (even ones without a grade yet) with that period's average, As Of
 * date and a "see all details (N)" link. Course names and the details link
 * open the per-assignment Grade Details drill-down.
 *
 * `studentId` is optional — defaults to the signed-in user's profile
 * (student looking at own grades). The parent view passes the child's id.
 */
export default function GradesPortal({
  studentId,
}: {
  studentId?: string;
  /** Legacy prop kept for compatibility with older callers; styling is now
   *  ProgressBook-fixed regardless of accent. */
  accent?: PanelAccent;
} = {}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();
  const targetId = studentId || user?.profileId;

  const [rows, setRows] = useState<GradeRow[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string | null>(null);
  const [detailSubject, setDetailSubject] = useState<string | null>(null);
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
      const gRows: GradeRow[] = (data || []).map((g: any) => ({
        id: g.id, subject_id: g.subject_id, subject_name: g.subject?.name || t("dashx.defaultCourse"),
        exam_type: g.exam_type || t("dashx.assignment"), score: g.score, max_score: g.max_score,
        term: g.term || "—", remarks: g.remarks || null, created_at: g.created_at,
      }));
      setRows(gRows);

      // Enrolled subjects: student → classes → class_subjects → subjects.
      // Including these means courses with no grades yet still appear in the
      // list (matching ProgressBook, where e.g. "LUNCH 6" shows an empty row).
      const { data: enr } = await supabase
        .from("student_classes")
        .select("class_id")
        .eq("student_id", targetId);
      const classIds = (enr || []).map((e: any) => e.class_id);
      let subjects: Course[] = [];
      if (classIds.length > 0) {
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("subject_id, subject:subjects(name)")
          .in("class_id", classIds);
        const m = new Map<string, string>();
        (cs || []).forEach((row: any) => {
          if (row.subject_id) m.set(row.subject_id, row.subject?.name || t("dashx.defaultCourse"));
        });
        subjects = Array.from(m.entries()).map(([id, name]) => ({ id, name }));
      }
      setEnrolledCourses(subjects);
      setLoading(false);
    };
    load();
  }, [targetId]);

  const pct = (r: GradeRow) => (r.max_score ? (r.score / r.max_score) * 100 : 0);

  // Reporting periods present in the data, ordered.
  const terms = useMemo(() => {
    const set = new Set(rows.map((r) => r.term).filter((t) => t && t !== "—"));
    return Array.from(set).sort((a, b) => periodRank(a) - periodRank(b) || a.localeCompare(b));
  }, [rows]);

  // Default to the term of the most recent grade (newest-first load order),
  // falling back to the first term, then "—" when no grades exist at all.
  const latestActiveTerm = rows.find((g) => g.term && g.term !== "—")?.term;
  const currentPeriod = period ?? latestActiveTerm ?? terms[0] ?? "—";

  // Date range covered by a reporting period (derived from its grade dates).
  const periodRange = (p: string): string => {
    const rs = rows.filter((r) => r.term === p && r.created_at);
    if (!rs.length) return "";
    const times = rs.map((r) => new Date(r.created_at).getTime());
    const start = new Date(Math.min(...times)).toISOString();
    const end = new Date(Math.max(...times)).toISOString();
    return `${shortDate(start)} - ${shortDate(end)}`;
  };

  // Union: every subject the student is enrolled in, plus any subject that
  // has a posted grade but no enrollment row (data hygiene safety net).
  const courses = useMemo<Course[]>(() => {
    const m = new Map<string, string>();
    enrolledCourses.forEach((c) => m.set(c.id, c.name));
    rows.forEach((r) => { if (!m.has(r.subject_id)) m.set(r.subject_id, r.subject_name); });
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrolledCourses, rows]);

  const inPeriod = (r: GradeRow, p: string) => p === "__all" || r.term === p;
  const avgFor = (subjectId: string, p: string): number | null => {
    const rs = rows.filter((r) => r.subject_id === subjectId && inPeriod(r, p));
    if (!rs.length) return null;
    return rs.reduce((s, r) => s + pct(r), 0) / rs.length;
  };
  const lastUpdatedFor = (subjectId: string, p: string) => {
    const rs = rows.filter((r) => r.subject_id === subjectId && inPeriod(r, p));
    return rs.length ? rs[0].created_at : "";
  };
  const countFor = (subjectId: string, p: string) =>
    rows.filter((r) => r.subject_id === subjectId && inPeriod(r, p)).length;

  const openDetails = (subjectId: string) => {
    setDetailSubject(subjectId);
    setViewBy("date");
  };

  if (loading) {
    return (
      <PBCard title={t("dashx.grades")}>
        <div className="py-10 flex justify-center">
          <div className="w-7 h-7 border-2 border-[#3a6d9a] border-t-transparent rounded-full animate-spin" />
        </div>
      </PBCard>
    );
  }

  if (courses.length === 0) {
    return (
      <PBCard title={t("dashx.grades")}>
        <EmptyHint text={t("dashx.noGrades")} />
      </PBCard>
    );
  }

  /* ── GRADE DETAILS DRILL-DOWN ───────────────────────────────────────── */
  if (detailSubject) {
    const courseName = courses.find((c) => c.id === detailSubject)?.name || t("dashx.defaultCourse");
    const items = rows.filter((r) => r.subject_id === detailSubject && r.term === currentPeriod);
    const classMark = items.length ? items.reduce((s, r) => s + pct(r), 0) / items.length : null;
    const range = periodRange(currentPeriod);

    const byType = () => {
      const m = new Map<string, GradeRow[]>();
      items.forEach((r) => { const a = m.get(r.exam_type) || []; a.push(r); m.set(r.exam_type, a); });
      return Array.from(m.entries()).map(([type, list]) => ({
        type, list, avg: list.reduce((s, r) => s + pct(r), 0) / list.length,
      }));
    };

    return (
      <PBCard
        title={t("dashx.gradeDetails")}
        action={<DetailsLink onClick={() => setDetailSubject(null)} label={t("dashx.backToGrades")} />}
      >
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0">
            {/* Class selector + period header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <label className="text-xs text-gray-500">
                <span className="block mb-1 font-semibold uppercase tracking-wide text-[10px]">{t("dashx.class")}</span>
                <select
                  value={detailSubject}
                  onChange={(e) => setDetailSubject(e.target.value)}
                  className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#3a6d9a]/40"
                >
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-700">{currentPeriod}</p>
                {range && <p className="text-xs text-gray-400">({range})</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-3">
              <h4 className="text-base font-bold text-gray-800 uppercase">{courseName}</h4>
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                <span className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-r border-gray-200">{t("dashx.viewBy")}</span>
                {(["date", "type"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewBy(v)}
                    className={`text-xs px-3 py-1.5 font-medium capitalize transition-colors ${
                      viewBy === v ? "bg-[#1f3a5f] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {v === "date" ? t("dashx.date") : t("dashx.type")}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-right text-sm font-bold text-gray-700 mb-3">
              {t("dashx.classMark")}: {classMark === null ? "—" : <span className={gradeColor(classMark)}>{fmt(classMark)}</span>}
            </p>

            {items.length === 0 ? (
              <EmptyHint text={t("dashx.noGradeDetails")} />
            ) : (
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#eef3f7] text-gray-600 text-xs">
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">{t("dashx.date")}</th>
                      <th className="text-left font-semibold px-3 py-2">{t("dashx.assignment")}</th>
                      <th className="text-left font-semibold px-3 py-2">{t("dashx.type")}</th>
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">{t("dashx.mark")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewBy === "date"
                      ? items.map((r, i) => <DetailRow key={r.id} r={r} pct={pct(r)} striped={i % 2 === 1} />)
                      : byType().map((g) => (
                          <TypeGroup key={g.type} type={g.type} avg={g.avg}>
                            {g.list.map((r, i) => <DetailRow key={r.id} r={r} pct={pct(r)} hideType striped={i % 2 === 1} />)}
                          </TypeGroup>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <PeriodTabs terms={terms} active={currentPeriod} onSelect={setPeriod} />
        </div>
      </PBCard>
    );
  }

  /* ── MAIN GRADES VIEW (per-quarter list of courses) ─────────────────── */
  const range = periodRange(currentPeriod);

  return (
    <PBCard title={t("dashx.grades")}>
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0">
          <h4 className="text-right text-base font-bold text-gray-700 mb-3 pr-1">
            {currentPeriod}{range && <span className="font-normal text-gray-500"> ({range})</span>}
          </h4>
          <div className="overflow-hidden rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#eef3f7] text-gray-600 text-xs">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="text-left font-semibold px-3 py-2">{t("dashx.course")}</th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">{t("dashx.grade")}</th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">{t("dashx.asOf")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c, i) => {
                  const avg = avgFor(c.id, currentPeriod);
                  const asOf = lastUpdatedFor(c.id, currentPeriod);
                  const n = countFor(c.id, currentPeriod);
                  const stripe = i % 2 === 1 ? "bg-gray-50/60" : "bg-white";
                  return (
                    <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-100/50 ${stripe}`}>
                      <td className="px-2 py-2.5 text-center text-gray-400">
                        <button
                          onClick={() => openDetails(c.id)}
                          aria-label={t("dashx.openDetailsFor", { name: c.name })}
                          className="hover:text-[#3a6d9a]"
                        >
                          ▸
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => openDetails(c.id)}
                          className="text-left text-[#2f6da3] font-medium hover:text-[#00467f] hover:underline"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {avg === null
                          ? <span className="text-gray-300">—</span>
                          : <span className={`font-semibold ${gradeColor(avg)}`}>{fmt(avg)}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {asOf ? shortDate(asOf) : ""}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openDetails(c.id)}
                          className="text-[#2f6da3] hover:text-[#00467f] hover:underline text-xs font-medium"
                        >
                          {t("dashx.seeAllDetails", { n })}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <PeriodTabs terms={terms} active={currentPeriod} onSelect={setPeriod} />
      </div>
    </PBCard>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const PeriodTabs = ({
  terms, active, onSelect,
}: { terms: string[]; active: string; onSelect: (t: string) => void }) => {
  if (terms.length === 0) return null;
  return (
    <aside className="lg:w-16 shrink-0 flex lg:flex-col flex-wrap gap-1.5 lg:pt-10">
      {terms.map((t) => {
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className={`text-sm font-bold transition-colors border-y border-r ${
              isActive
                ? "bg-white text-[#1f3a5f] border-[#3a6d9a] lg:rounded-r-md lg:-mr-px px-4 py-2.5 shadow-sm"
                : "bg-[#eef3f7] text-gray-500 border-gray-200 hover:bg-gray-100 px-3 py-2 rounded-r-md lg:rounded-md"
            }`}
          >
            {t}
          </button>
        );
      })}
    </aside>
  );
};

const DetailRow = ({ r, pct, hideType, striped }: {
  r: GradeRow; pct: number; hideType?: boolean; striped?: boolean;
}) => (
  <tr className={`border-t border-gray-100 hover:bg-gray-100/50 align-top ${striped ? "bg-gray-50/60" : "bg-white"}`}>
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
    <tr className="bg-[#eef3f7]">
      <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">{type}</td>
      <td className="px-3 py-1.5 text-xs font-bold text-right">
        <span className={gradeColor(avg)}>{fmt(avg)}</span>
      </td>
    </tr>
    {children}
  </>
);

