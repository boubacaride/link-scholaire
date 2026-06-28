"use client";

// Attendance & Performance — admin-only unified oversight dashboard.
//   • KPI row (whole-school attendance rate + academic average this month,
//     with month-over-month deltas; grade levels below target).
//   • Section A — Attendance: reuses the existing admin attendance page as-is.
//   • Section B — Academic Overview: per-grade-level stats (this month).
//   • Section C — Trends: dual-axis month-over-month chart.
// KPI / overview / trends read from performance_snapshots (migration 039);
// the Attendance section reads live data through the reused page.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { SummaryStat, gradeColor } from "@/components/dashboard/PortalUI";
import { delta } from "@/lib/performance/academics";
import TrendChart, { type TrendPoint } from "@/components/performance/TrendChart";
import AdminAttendancePage from "@/app/(dashboard)/list/attendance/admin/page";

interface Snap {
  grade_level: string;
  period_month: string; // "YYYY-MM-DD"
  academic_average: number | null;
  attendance_rate: number | null;
  students_counted: number;
}

type Tab = "attendance" | "academic" | "trends";

const ATTENDANCE_TARGET = 90; // a grade level below this is "below target"
const ACADEMIC_TARGET = 60;

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;

const PerformancePage = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();
  const canManage = user?.role === "school_admin" || user?.role === "platform_admin";

  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("ALL");
  const [tab, setTab] = useState<Tab>("academic");

  useEffect(() => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("performance_snapshots")
        .select("grade_level, period_month, academic_average, attendance_rate, students_counted")
        .eq("school_id", user.schoolId)
        .order("period_month", { ascending: true });
      setSnaps((data as Snap[]) ?? []);
      setLoading(false);
    })();
  }, [user?.schoolId]);

  const months = useMemo(
    () => Array.from(new Set(snaps.map((s) => s.period_month))).sort(),
    [snaps],
  );
  const gradeLevels = useMemo(
    () =>
      Array.from(new Set(snaps.map((s) => s.grade_level)))
        .filter((g) => g !== "ALL")
        .sort((a, b) => Number(a) - Number(b)),
    [snaps],
  );
  const latestMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  const monthLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US", {
      month: "short",
      year: "numeric",
    }).format(d);
  };

  // KPI source: whole-school ('ALL') rows for the latest two months.
  const allLatest = snaps.find((s) => s.grade_level === "ALL" && s.period_month === latestMonth);
  const allPrev = snaps.find((s) => s.grade_level === "ALL" && s.period_month === prevMonth);
  const attDelta = delta(allLatest?.attendance_rate ?? null, allPrev?.attendance_rate ?? null);
  const acaDelta = delta(allLatest?.academic_average ?? null, allPrev?.academic_average ?? null);

  const belowTarget = useMemo(
    () =>
      snaps.filter(
        (s) =>
          s.grade_level !== "ALL" &&
          s.period_month === latestMonth &&
          ((s.attendance_rate !== null && s.attendance_rate < ATTENDANCE_TARGET) ||
            (s.academic_average !== null && s.academic_average < ACADEMIC_TARGET)),
      ).length,
    [snaps, latestMonth],
  );

  const trendSeries: TrendPoint[] = useMemo(
    () =>
      months.map((m) => {
        const row = snaps.find((s) => s.grade_level === level && s.period_month === m);
        return {
          label: monthLabel(m),
          academic: row?.academic_average ?? null,
          attendance: row?.attendance_rate ?? null,
        };
      }),
    [snaps, months, level],
  );

  // Academic Overview rows: this month, per grade level + whole school.
  const overviewRows = useMemo(() => {
    const rows = snaps.filter((s) => s.period_month === latestMonth && s.grade_level !== "ALL");
    rows.sort((a, b) => Number(a.grade_level) - Number(b.grade_level));
    return rows;
  }, [snaps, latestMonth]);

  const deltaHint = (d: ReturnType<typeof delta>) => {
    if (d.pct === null) return t("perf.noPrev");
    const arrow = d.direction === "up" ? "▲" : d.direction === "down" ? "▼" : "▬";
    return `${arrow} ${Math.abs(d.pct).toFixed(1)}% · ${t("perf.thisMonth")}`;
  };

  if (!canManage) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          {t("perf.adminOnly")}
        </div>
      </div>
    );
  }

  const hasSnaps = snaps.length > 0;

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header + grade-level filter */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("perf.title")}</h1>
          <p className="text-xs text-gray-500">{t("perf.subtitle")}</p>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 block">{t("perf.gradeLevel")}</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="mt-1 text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="ALL">{t("perf.allGrades")}</option>
            {gradeLevels.map((g) => (
              <option key={g} value={g}>{t("perf.grade", { n: g })}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat
          label={t("perf.kpiAttendance")} icon="🟢" accent="emerald"
          value={fmtPct(allLatest?.attendance_rate ?? null)}
          valueClass={allLatest?.attendance_rate != null ? gradeColor(allLatest.attendance_rate) : "text-gray-400"}
          hint={deltaHint(attDelta)}
        />
        <SummaryStat
          label={t("perf.kpiAcademic")} icon="🎯" accent="indigo"
          value={fmtPct(allLatest?.academic_average ?? null)}
          valueClass={allLatest?.academic_average != null ? gradeColor(allLatest.academic_average) : "text-gray-400"}
          hint={deltaHint(acaDelta)}
        />
        <SummaryStat
          label={t("perf.kpiBelowTarget")} icon="⚠️" accent="amber"
          value={hasSnaps ? String(belowTarget) : "—"}
          hint={`${gradeLevels.length} ${t("perf.gradeLevel").toLowerCase()}`}
        />
        <SummaryStat
          label={t("perf.kpiStudents")} icon="👥" accent="sky"
          value={hasSnaps ? String(allLatest?.students_counted ?? 0) : "—"}
          hint={latestMonth ? monthLabel(latestMonth) : ""}
        />
      </div>

      {!hasSnaps && !loading && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
          {t("perf.noSnapshots")}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ["attendance", t("perf.tabAttendance")],
          ["academic", t("perf.tabAcademic")],
          ["trends", t("perf.tabTrends")],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Section A — Attendance (reuses the existing admin attendance page) */}
      {tab === "attendance" && (
        <div className="-mx-4 -mb-4">
          <AdminAttendancePage />
        </div>
      )}

      {/* Section B — Academic Overview */}
      {tab === "academic" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">{t("perf.overviewTitle")}</h2>
          {overviewRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t("perf.trendEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                  <tr>
                    <th className="text-left py-2">{t("perf.colGradeLevel")}</th>
                    <th className="text-center py-2">{t("perf.colAcademic")}</th>
                    <th className="text-center py-2">{t("perf.colAttendance")}</th>
                    <th className="text-center py-2">{t("perf.colStudents")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewRows.map((r) => (
                    <tr key={r.grade_level} className="border-b hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-800">{t("perf.grade", { n: r.grade_level })}</td>
                      <td className={`py-2.5 text-center font-semibold ${r.academic_average != null ? gradeColor(r.academic_average) : "text-gray-400"}`}>
                        {fmtPct(r.academic_average)}
                      </td>
                      <td className={`py-2.5 text-center font-semibold ${r.attendance_rate != null ? gradeColor(r.attendance_rate) : "text-gray-400"}`}>
                        {fmtPct(r.attendance_rate)}
                      </td>
                      <td className="py-2.5 text-center text-gray-600">{r.students_counted}</td>
                    </tr>
                  ))}
                  {allLatest && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="py-2.5 text-gray-800">{t("perf.wholeSchool")}</td>
                      <td className={`py-2.5 text-center ${allLatest.academic_average != null ? gradeColor(allLatest.academic_average) : "text-gray-400"}`}>
                        {fmtPct(allLatest.academic_average)}
                      </td>
                      <td className={`py-2.5 text-center ${allLatest.attendance_rate != null ? gradeColor(allLatest.attendance_rate) : "text-gray-400"}`}>
                        {fmtPct(allLatest.attendance_rate)}
                      </td>
                      <td className="py-2.5 text-center text-gray-600">{allLatest.students_counted}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section C — Trends */}
      {tab === "trends" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">{t("perf.trendsTitle")}</h2>
          <p className="text-[11px] text-gray-400 mb-3">
            {level === "ALL" ? t("perf.allGrades") : t("perf.grade", { n: level })}
          </p>
          <div className="h-[320px]">
            <TrendChart
              data={trendSeries}
              academicLabel={t("perf.academicAxis")}
              attendanceLabel={t("perf.attendanceAxis")}
              emptyLabel={t("perf.trendEmpty")}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformancePage;
