"use client";

// Attendance & Performance — admin-only unified oversight dashboard.
//   • KPI row (whole-school attendance rate + academic average this month,
//     with month-over-month deltas; grade levels below target).
//   • Section A — Attendance: reuses the existing admin attendance page as-is.
//   • Section B — Academic Overview: per-grade-level stats (this month).
//   • Section C — Trends: dual-axis month-over-month chart.
// KPI / overview / trends read from performance_snapshots (migration 039);
// the Attendance section reads live data through the reused page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { SummaryStat, gradeColor } from "@/components/dashboard/PortalUI";
import TrendChart, { type TrendPoint } from "@/components/performance/TrendChart";
import ExportBar from "@/components/performance/ExportBar";
import DrillDown from "@/components/performance/DrillDown";
import TeachingOverview from "@/components/performance/TeachingOverview";
import AdminAttendancePage from "@/app/(dashboard)/list/attendance/admin/page";

interface Snap {
  grade_level: string;
  period_month: string; // "YYYY-MM-DD"
  academic_average: number | null;
  attendance_rate: number | null;
  students_counted: number;
}

type Tab = "attendance" | "academic" | "teaching" | "trends";

// Live whole-school KPI summary (perf_school_summary RPC). Computed on the fly
// so the cards always match the drill-down, regardless of which month a
// snapshot was captured for.
interface Kpi {
  academic_average: number | null;
  attendance_rate: number | null;
  pass_rate: number | null;
  students: number;
  grade_levels: number;
  below_target: number;
}

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
  const [recomputing, setRecomputing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [kpi, setKpi] = useState<Kpi | null>(null);

  // One capture target per tab for the Print / Download / Share PDF export.
  const attendanceRef = useRef<HTMLDivElement>(null);
  const academicRef = useRef<HTMLDivElement>(null);
  const teachingRef = useRef<HTMLDivElement>(null);
  const trendsRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const exportName = (key: string) => `${t(key).replace(/\s+/g, "-")}-${today}.pdf`;

  // Live KPI summary — independent of the snapshot history.
  useEffect(() => {
    if (!supabase || !user?.schoolId) return;
    (async () => {
      const { data } = await supabase.rpc("perf_school_summary", {});
      const row = (data as Kpi[] | null)?.[0] ?? null;
      setKpi(row);
    })();
  }, [supabase, user?.schoolId]);

  const loadSnaps = useCallback(async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("performance_snapshots")
      .select("grade_level, period_month, academic_average, attendance_rate, students_counted")
      .eq("school_id", user.schoolId)
      .order("period_month", { ascending: true });
    setSnaps((data as Snap[]) ?? []);
    setLoading(false);
  }, [supabase, user?.schoolId]);

  useEffect(() => { loadSnaps(); }, [loadSnaps]);

  const onRecompute = async () => {
    if (!supabase) return;
    setRecomputing(true);
    setMsg(null);
    const first = new Date();
    const p_month = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
    const { error } = await supabase.rpc("capture_performance_snapshot", { p_month });
    setRecomputing(false);
    if (error) { setMsg(t("perf.recomputeFailed")); return; }
    setMsg(t("perf.recomputed"));
    loadSnaps();
  };

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
  const monthLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US", {
      month: "short",
      year: "numeric",
    }).format(d);
  };

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
        <div className="flex items-end gap-2">
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
          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="text-sm bg-gray-800 text-white px-3 py-2 rounded-md hover:bg-gray-900 disabled:opacity-50"
          >
            {recomputing ? t("perf.recomputing") : t("perf.recompute")}
          </button>
        </div>
      </div>
      {msg && (
        <p className={`text-xs ${msg === t("perf.recomputeFailed") ? "text-red-600" : "text-emerald-700"}`}>{msg}</p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat
          label={t("perf.kpiAttendance")} icon="🟢" accent="emerald"
          value={fmtPct(kpi?.attendance_rate ?? null)}
          valueClass={kpi?.attendance_rate != null ? gradeColor(kpi.attendance_rate) : "text-gray-400"}
          hint={t("perf.allTime")}
        />
        <SummaryStat
          label={t("perf.kpiAcademic")} icon="🎯" accent="indigo"
          value={fmtPct(kpi?.academic_average ?? null)}
          valueClass={kpi?.academic_average != null ? gradeColor(kpi.academic_average) : "text-gray-400"}
          hint={`${kpi?.students ?? 0} ${t("perf.graded")}`}
        />
        <SummaryStat
          label={t("perf.kpiBelowTarget")} icon="⚠️" accent="amber"
          value={kpi ? String(kpi.below_target) : "—"}
          hint={`${kpi?.grade_levels ?? 0} ${t("perf.gradeLevel").toLowerCase()}`}
        />
        <SummaryStat
          label={t("perf.kpiStudents")} icon="👥" accent="sky"
          value={kpi ? String(kpi.students) : "—"}
          hint={t("perf.graded")}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ["attendance", t("perf.tabAttendance")],
          ["academic", t("perf.tabAcademic")],
          ["teaching", t("perf.tabTeaching")],
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
        <div>
          <ExportBar targetRef={attendanceRef} filename={exportName("perf.tabAttendance")} title={t("perf.tabAttendance")} />
          <div ref={attendanceRef} className="bg-[#F7F8FA]">
            <AdminAttendancePage />
          </div>
        </div>
      )}

      {/* Section B — Academic Overview + drill-down (School→Grade→Class→Student) */}
      {tab === "academic" && (
        <div>
          <ExportBar targetRef={academicRef} filename={exportName("perf.tabAcademic")} title={t("perf.tabAcademic")} />
          <div ref={academicRef}><DrillDown /></div>
        </div>
      )}

      {/* Teaching Overview — per-teacher performance */}
      {tab === "teaching" && (
        <div>
          <ExportBar targetRef={teachingRef} filename={exportName("perf.tabTeaching")} title={t("perf.tabTeaching")} />
          <div ref={teachingRef}><TeachingOverview /></div>
        </div>
      )}

      {/* Section C — Trends (month-over-month, from captured snapshots) */}
      {tab === "trends" && (
        <div>
          <ExportBar targetRef={trendsRef} filename={exportName("perf.tabTrends")} title={t("perf.tabTrends")} />
          <div ref={trendsRef} className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">{t("perf.trendsTitle")}</h2>
          <p className="text-[11px] text-gray-400 mb-3">
            {level === "ALL" ? t("perf.allGrades") : t("perf.grade", { n: level })}
          </p>
          {!hasSnaps && !loading ? (
            <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>{t("perf.noSnapshots")}</span>
              <button
                onClick={onRecompute}
                disabled={recomputing}
                className="shrink-0 bg-amber-600 text-white px-3 py-1.5 rounded-md hover:bg-amber-700 disabled:opacity-50"
              >
                {recomputing ? t("perf.recomputing") : t("perf.recompute")}
              </button>
            </div>
          ) : (
            <div className="h-[320px]">
              <TrendChart
                data={trendSeries}
                academicLabel={t("perf.academicAxis")}
                attendanceLabel={t("perf.attendanceAxis")}
                emptyLabel={t("perf.trendEmpty")}
              />
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformancePage;
