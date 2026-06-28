"use client";

// Admin drill-down: School → Grade level → Class → Student → Student detail.
// Levels 1–3 aggregate server-side via the perf_* RPCs (migration 040); the
// single-student detail (Level 4) reads that one student's rows directly.
// Breadcrumbs navigate back up; Level 3 has quick filters + sort.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { gradeColor } from "@/components/dashboard/PortalUI";
import TrendChart, { type TrendPoint } from "@/components/performance/TrendChart";

interface GradeRow {
  grade_level: string; students: number; graded: number;
  academic_average: number | null; attendance_rate: number | null; pass_rate: number | null;
  at_risk: number; a_count: number; b_count: number; c_count: number; d_count: number; f_count: number;
}
interface ClassRow {
  class_id: string; class_name: string; students: number; graded: number;
  academic_average: number | null; attendance_rate: number | null; pass_rate: number | null; at_risk: number;
}
interface StudentRow {
  student_id: string; student_name: string;
  academic_average: number | null; attendance_rate: number | null;
  present: number; absent: number; late: number; excused: number;
  performing_well: boolean; at_risk: boolean; attendance_concern: boolean;
}

type Filter = "all" | "risk" | "attn" | "top";
type Sort = "name" | "academic" | "attendance";

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`;
const color = (v: number | null | undefined) =>
  v === null || v === undefined ? "text-gray-400" : gradeColor(Number(v));
const isMissingRpc = (msg?: string) =>
  !!msg && /could not find the function|does not exist|PGRST202|schema cache/i.test(msg);

const DrillDown = () => {
  const { t } = useI18n();
  const supabase = createClient();

  const [grade, setGrade] = useState<string | null>(null);
  const [cls, setCls] = useState<{ id: string; name: string } | null>(null);
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rpcMissing, setRpcMissing] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");

  // ── Load the current level ──────────────────────────────────────────
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setRpcMissing(false);
    try {
      if (student) return; // Level 4 loads in its own component
      if (cls) {
        const { data, error } = await supabase.rpc("perf_class_students", { p_class_id: cls.id });
        if (error) { if (isMissingRpc(error.message)) setRpcMissing(true); setStudents([]); return; }
        setStudents((data as StudentRow[]) ?? []);
      } else if (grade) {
        const { data, error } = await supabase.rpc("perf_classes", { p_grade: grade });
        if (error) { if (isMissingRpc(error.message)) setRpcMissing(true); setClasses([]); return; }
        setClasses((data as ClassRow[]) ?? []);
      } else {
        const { data, error } = await supabase.rpc("perf_grade_levels", {});
        if (error) { if (isMissingRpc(error.message)) setRpcMissing(true); setGrades([]); return; }
        setGrades((data as GradeRow[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, grade, cls, student]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFilter("all"); setSort("name"); }, [grade, cls]);

  // ── Level 3 filtered + sorted view ──────────────────────────────────
  const visibleStudents = useMemo(() => {
    let rows = students;
    if (filter === "risk") rows = rows.filter((s) => s.at_risk);
    else if (filter === "attn") rows = rows.filter((s) => s.attendance_concern);
    else if (filter === "top") rows = rows.filter((s) => s.performing_well);
    const sorted = [...rows];
    if (sort === "name") sorted.sort((a, b) => a.student_name.localeCompare(b.student_name));
    else if (sort === "academic") sorted.sort((a, b) => (b.academic_average ?? -1) - (a.academic_average ?? -1));
    else sorted.sort((a, b) => (b.attendance_rate ?? -1) - (a.attendance_rate ?? -1));
    return sorted;
  }, [students, filter, sort]);

  // ── Breadcrumbs ─────────────────────────────────────────────────────
  const Crumbs = () => (
    <div className="flex flex-wrap items-center gap-1 text-sm mb-3">
      <Crumb label={t("perf.crumbSchool")} onClick={() => { setGrade(null); setCls(null); setStudent(null); }} active={!grade} />
      {grade && (
        <>
          <Sep />
          <Crumb label={t("perf.grade", { n: grade })} onClick={() => { setCls(null); setStudent(null); }} active={!!grade && !cls} />
        </>
      )}
      {cls && (
        <>
          <Sep />
          <Crumb label={cls.name} onClick={() => setStudent(null)} active={!!cls && !student} />
        </>
      )}
      {student && (<><Sep /><Crumb label={student.name} onClick={() => {}} active /></>)}
    </div>
  );

  if (rpcMissing) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
          {t("perf.rpcMissing")}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <Crumbs />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">{t("perf.loading")}</p>
      ) : student ? (
        <StudentDetail studentId={student.id} />
      ) : cls ? (
        <>
          {/* Quick filters + sort (Level 3) */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(["all", "risk", "attn", "top"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[11px] px-2.5 py-1 rounded-full border ${
                  filter === f ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {t(`perf.filter${f === "all" ? "All" : f === "risk" ? "Risk" : f === "attn" ? "Attn" : "Top"}`)}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-gray-400">{t("perf.sortBy")}:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="text-[11px] border border-gray-200 rounded px-1.5 py-1">
              <option value="name">{t("perf.sortName")}</option>
              <option value="academic">{t("perf.sortAcademic")}</option>
              <option value="attendance">{t("perf.sortAttendance")}</option>
            </select>
          </div>
          {visibleStudents.length === 0 ? (
            <Empty t={t("perf.emptyLevel")} />
          ) : (
            <Table head={[t("perf.colStudents"), t("perf.colAcademic"), t("perf.colAttendance"), ""]}>
              {visibleStudents.map((s) => (
                <tr key={s.student_id} className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setStudent({ id: s.student_id, name: s.student_name })}>
                  <td className="py-2.5 font-medium text-gray-800">{s.student_name}</td>
                  <td className={`py-2.5 text-center font-semibold ${color(s.academic_average)}`}>{fmtPct(s.academic_average)}</td>
                  <td className={`py-2.5 text-center font-semibold ${color(s.attendance_rate)}`}>{fmtPct(s.attendance_rate)}</td>
                  <td className="py-2.5 text-right"><Flags s={s} t={t} /></td>
                </tr>
              ))}
            </Table>
          )}
        </>
      ) : grade ? (
        classes.length === 0 ? <Empty t={t("perf.emptyLevel")} /> : (
          <Table head={[t("perf.colClass"), t("perf.colStudents"), t("perf.colAcademic"), t("perf.colAttendance"), t("perf.colPassRate"), t("perf.colAtRisk")]}>
            {classes.map((c) => (
              <tr key={c.class_id} className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setCls({ id: c.class_id, name: c.class_name })}>
                <td className="py-2.5 font-medium text-gray-800">{c.class_name}</td>
                <td className="py-2.5 text-center text-gray-600">{c.students}</td>
                <td className={`py-2.5 text-center font-semibold ${color(c.academic_average)}`}>{fmtPct(c.academic_average)}</td>
                <td className={`py-2.5 text-center font-semibold ${color(c.attendance_rate)}`}>{fmtPct(c.attendance_rate)}</td>
                <td className="py-2.5 text-center text-gray-600">{fmtPct(c.pass_rate)}</td>
                <td className="py-2.5 text-center"><AtRiskPill n={c.at_risk} /></td>
              </tr>
            ))}
          </Table>
        )
      ) : (
        grades.length === 0 ? <Empty t={t("perf.emptyLevel")} /> : (
          <Table head={[t("perf.colGradeLevel"), t("perf.colStudents"), t("perf.colAcademic"), t("perf.colAttendance"), t("perf.colPassRate"), t("perf.distribution")]}>
            {grades.map((g) => (
              <tr key={g.grade_level} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setGrade(g.grade_level)}>
                <td className="py-2.5 font-medium text-gray-800">{t("perf.grade", { n: g.grade_level })}</td>
                <td className="py-2.5 text-center text-gray-600">{g.students}</td>
                <td className={`py-2.5 text-center font-semibold ${color(g.academic_average)}`}>{fmtPct(g.academic_average)}</td>
                <td className={`py-2.5 text-center font-semibold ${color(g.attendance_rate)}`}>{fmtPct(g.attendance_rate)}</td>
                <td className="py-2.5 text-center text-gray-600">{fmtPct(g.pass_rate)}</td>
                <td className="py-2.5"><DistBar g={g} /></td>
              </tr>
            ))}
          </Table>
        )
      )}
    </div>
  );
};

// ── Level 4: single-student detail (direct reads) ──────────────────────
const StudentDetail = ({ studentId }: { studentId: string }) => {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [subjects, setSubjects] = useState<{ name: string; avg: number | null }[]>([]);
  const [att, setAtt] = useState({ present: 0, absent: 0, late: 0, excused: 0 });
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const monthKey = (iso: string) => iso.slice(0, 7);
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US", { month: "short", year: "2-digit" })
      .format(new Date(`${key}-01T00:00:00`));

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      type G = { score: number; max_score: number; created_at: string; subject: { name: string } | null };
      type A = { status: string; date: string };
      const [gRes, aRes] = await Promise.all([
        supabase.from("grades").select("score, max_score, created_at, subject:subject_id(name)").eq("student_id", studentId),
        supabase.from("attendance").select("status, date").eq("student_id", studentId),
      ]);
      const gs = ((gRes.data as unknown as G[]) ?? []).filter((g) => g.subject);
      const as = (aRes.data as A[]) ?? [];

      // Per-subject average
      const bySub = new Map<string, number[]>();
      gs.forEach((g) => {
        if (g.max_score <= 0) return;
        const arr = bySub.get(g.subject!.name) ?? [];
        arr.push((g.score / g.max_score) * 100);
        bySub.set(g.subject!.name, arr);
      });
      setSubjects(
        Array.from(bySub, ([name, arr]) => ({ name, avg: arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      // Attendance totals
      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      as.forEach((a) => { if (a.status in counts) (counts as Record<string, number>)[a.status] += 1; });
      setAtt(counts);

      // Monthly trend: academic (mean mark %) + attendance rate
      const months = Array.from(new Set([...gs.map((g) => monthKey(g.created_at)), ...as.map((a) => monthKey(a.date))])).sort();
      setTrend(months.map((m) => {
        const marks = gs.filter((g) => monthKey(g.created_at) === m && g.max_score > 0);
        const academic = marks.length ? marks.reduce((s, g) => s + (g.score / g.max_score) * 100, 0) / marks.length : null;
        const days = as.filter((a) => monthKey(a.date) === m);
        const attended = days.filter((a) => a.status === "present" || a.status === "late").length;
        const attendance = days.length ? (attended / days.length) * 100 : null;
        return { label: monthLabel(m), academic, attendance };
      }));
      setLoading(false);
    })();
  }, [studentId]);

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">{t("perf.loading")}</p>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">{t("perf.detailSubjects")}</h3>
        {subjects.length === 0 ? <Empty t={t("perf.emptyLevel")} /> : (
          <Table head={[t("perf.colSubject"), t("perf.colMark")]}>
            {subjects.map((s) => (
              <tr key={s.name} className="border-b">
                <td className="py-2 text-gray-800">{s.name}</td>
                <td className={`py-2 text-center font-semibold ${color(s.avg)}`}>{fmtPct(s.avg)}</td>
              </tr>
            ))}
          </Table>
        )}
        <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">{t("perf.detailHistory")}</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label={t("perf.present")} value={att.present} tone="text-emerald-600" />
          <Stat label={t("perf.absent")} value={att.absent} tone="text-red-600" />
          <Stat label={t("perf.late")} value={att.late} tone="text-amber-600" />
          <Stat label={t("perf.excused")} value={att.excused} tone="text-sky-600" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">{t("perf.detailTrend")}</h3>
        <div className="h-[260px]">
          <TrendChart data={trend} academicLabel={t("perf.academicAxis")} attendanceLabel={t("perf.attendanceAxis")} emptyLabel={t("perf.trendEmpty")} />
        </div>
      </div>
    </div>
  );
};

// ── Small presentational helpers ───────────────────────────────────────
const Crumb = ({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) => (
  <button onClick={onClick} disabled={active}
    className={`px-1.5 py-0.5 rounded ${active ? "font-semibold text-gray-900" : "text-blue-600 hover:underline"}`}>
    {label}
  </button>
);
const Sep = () => <span className="text-gray-300">/</span>;
const Empty = ({ t }: { t: string }) => <p className="text-sm text-gray-400 text-center py-6">{t}</p>;
const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="bg-gray-50 rounded-lg py-2">
    <p className={`text-lg font-bold ${tone}`}>{value}</p>
    <p className="text-[10px] text-gray-400">{label}</p>
  </div>
);
const AtRiskPill = ({ n }: { n: number }) => (
  <span className={`text-[11px] px-2 py-0.5 rounded-full ${n > 0 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-400"}`}>{n}</span>
);
const DistBar = ({ g }: { g: GradeRow }) => {
  const segs = [
    { n: g.a_count, c: "#16a34a" }, { n: g.b_count, c: "#65a30d" }, { n: g.c_count, c: "#ca8a04" },
    { n: g.d_count, c: "#ea580c" }, { n: g.f_count, c: "#dc2626" },
  ];
  const total = segs.reduce((s, x) => s + x.n, 0);
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden w-32 mx-auto">
      {segs.map((s, i) => s.n > 0 && (
        <div key={i} style={{ width: `${(s.n / total) * 100}%`, background: s.c }} title={`${s.n}`} />
      ))}
    </div>
  );
};
const Flags = ({ s, t }: { s: StudentRow; t: (k: string) => string }) => (
  <div className="inline-flex gap-1 flex-wrap justify-end">
    {s.performing_well && <Tag text={t("perf.flagWell")} cls="bg-emerald-50 text-emerald-700" />}
    {s.at_risk && <Tag text={t("perf.flagRisk")} cls="bg-red-50 text-red-700" />}
    {s.attendance_concern && <Tag text={t("perf.flagAttendance")} cls="bg-amber-50 text-amber-800" />}
  </div>
);
const Tag = ({ text, cls }: { text: string; cls: string }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{text}</span>
);
const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
        <tr>
          {head.map((h, i) => (
            <th key={i} className={i === 0 ? "text-left py-2" : "text-center py-2"}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export default DrillDown;
