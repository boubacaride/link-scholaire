"use client";

// Teaching Overview — per-teacher performance from the perf_teachers RPC
// (migrations 042/043). Shows a comparison bar chart of each teacher's
// blended performance score plus a sortable detail table. Score is computed
// client-side by calculateTeacherPerformance() (70% academics / 20%
// attendance / 10% assignment completion, renormalised over what exists).

import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { gradeColor } from "@/components/dashboard/PortalUI";
import { calculateTeacherPerformance } from "@/lib/performance/teacherScore";

interface Row {
  teacher_id: string; teacher_name: string;
  classes: number; subjects: number; students: number;
  academic_average: number | null; attendance_rate: number | null;
  pass_rate: number | null; completion_rate: number | null; at_risk: number;
}
interface Scored extends Row { score: number | null }
type Sort = "score" | "name" | "academic" | "attendance" | "atrisk";

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`;
const color = (v: number | null | undefined) =>
  v === null || v === undefined ? "text-gray-400" : gradeColor(Number(v));
const scoreFill = (s: number | null) =>
  s === null ? "#cbd5e1" : s >= 80 ? "#16a34a" : s >= 60 ? "#f59e0b" : "#dc2626";
const isMissingRpc = (msg?: string) =>
  !!msg && /could not find the function|does not exist|PGRST202|schema cache/i.test(msg);

const TeachingOverview = () => {
  const { t } = useI18n();
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rpcMissing, setRpcMissing] = useState(false);
  const [sort, setSort] = useState<Sort>("score");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      setLoading(true); setError(false); setRpcMissing(false);
      const { data, error: err } = await supabase.rpc("perf_teachers", {});
      if (err) {
        if (isMissingRpc(err.message)) setRpcMissing(true);
        else setError(true);
        setRows([]);
      } else {
        setRows((data as Row[]) ?? []);
      }
      setLoading(false);
    })();
  }, [supabase]);

  // Blend each teacher's metrics into a single score.
  const scored = useMemo<Scored[]>(
    () =>
      rows.map((r) => ({
        ...r,
        score: calculateTeacherPerformance({
          academic: r.academic_average,
          attendance: r.attendance_rate,
          completion: r.completion_rate,
        }),
      })),
    [rows],
  );

  // Chart is always ranked by score (highest first); table follows its own sort.
  const chartData = useMemo(
    () =>
      [...scored]
        .filter((r) => r.score !== null)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map((r) => ({
          name: r.teacher_name,
          score: r.score === null ? 0 : Math.round(r.score * 10) / 10,
          classes: r.classes,
          academic: r.academic_average,
          attendance: r.attendance_rate,
        })),
    [scored],
  );

  const sortedRows = useMemo(() => {
    const r = [...scored];
    if (sort === "name") r.sort((a, b) => a.teacher_name.localeCompare(b.teacher_name));
    else if (sort === "score") r.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    else if (sort === "academic") r.sort((a, b) => (b.academic_average ?? -1) - (a.academic_average ?? -1));
    else if (sort === "attendance") r.sort((a, b) => (b.attendance_rate ?? -1) - (a.attendance_rate ?? -1));
    else r.sort((a, b) => b.at_risk - a.at_risk);
    return r;
  }, [scored, sort]);

  // ── Custom tooltip ──────────────────────────────────────────────────
  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as typeof chartData[number];
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-2.5 text-xs space-y-0.5">
        <p className="font-semibold text-gray-800">{d.name}</p>
        <p className="text-gray-600">{t("perf.tipScore")}: <b className={color(d.score)}>{fmtPct(d.score)}</b></p>
        <p className="text-gray-600">{t("perf.tipClasses")}: {d.classes}</p>
        <p className="text-gray-600">{t("perf.tipAcademic")}: {fmtPct(d.academic)}</p>
        {d.attendance !== null && (
          <p className="text-gray-600">{t("perf.tipAttendance")}: {fmtPct(d.attendance)}</p>
        )}
      </div>
    );
  };

  // ── States ──────────────────────────────────────────────────────────
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border shadow-sm p-4">{children}</div>
  );
  if (rpcMissing) return <Wrap><Banner text={t("perf.rpcMissing")} /></Wrap>;
  if (error) return <Wrap><Banner text={t("perf.teachersError")} tone="red" /></Wrap>;
  if (loading) return <Wrap><p className="text-sm text-gray-400 text-center py-10">{t("perf.loading")}</p></Wrap>;
  if (scored.length === 0)
    return <Wrap><p className="text-sm text-gray-400 text-center py-10">{t("perf.teachersEmpty")}</p></Wrap>;

  return (
    <div className="flex flex-col gap-4">
      {/* Comparison bar chart */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-800">{t("perf.chartTitle")}</h2>
        <p className="text-[11px] text-gray-400 mb-3">{t("perf.scoreHint")}</p>
        <div className="h-[300px]" role="img" aria-label={t("perf.chartAria")}>
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">{t("perf.teachersEmpty")}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis
                  dataKey="name" interval={0} angle={-25} textAnchor="end" height={60}
                  tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false}
                />
                <YAxis
                  domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} axisLine={false}
                  label={{ value: t("perf.colScore"), angle: -90, position: "insideLeft", style: { fill: "#6b7280", fontSize: 12 } }}
                />
                <Tooltip content={renderTooltip} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="score" name={t("perf.tipScore")} radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {chartData.map((d) => <Cell key={d.name} fill={scoreFill(d.score)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">{t("perf.chartCaption")}</p>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-800">{t("perf.teachingTitle")}</h2>
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <span>{t("perf.sortBy")}:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="border border-gray-200 rounded px-1.5 py-1">
              <option value="score">{t("perf.colScore")}</option>
              <option value="name">{t("perf.sortName")}</option>
              <option value="academic">{t("perf.sortAcademic")}</option>
              <option value="attendance">{t("perf.sortAttendance")}</option>
              <option value="atrisk">{t("perf.colAtRisk")}</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
              <tr>
                <th className="text-left py-2">{t("perf.colTeacher")}</th>
                <th className="text-center py-2">{t("perf.colScore")}</th>
                <th className="text-center py-2">{t("perf.colClasses")}</th>
                <th className="text-center py-2">{t("perf.colSubjects")}</th>
                <th className="text-center py-2">{t("perf.colStudents")}</th>
                <th className="text-center py-2">{t("perf.colAcademic")}</th>
                <th className="text-center py-2">{t("perf.colAttendance")}</th>
                <th className="text-center py-2">{t("perf.colCompletion")}</th>
                <th className="text-center py-2">{t("perf.colAtRisk")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.teacher_id} className="border-b hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-800">{r.teacher_name}</td>
                  <td className={`py-2.5 text-center font-bold ${color(r.score)}`}>{fmtPct(r.score)}</td>
                  <td className="py-2.5 text-center text-gray-600">{r.classes}</td>
                  <td className="py-2.5 text-center text-gray-600">{r.subjects}</td>
                  <td className="py-2.5 text-center text-gray-600">{r.students}</td>
                  <td className={`py-2.5 text-center font-semibold ${color(r.academic_average)}`}>{fmtPct(r.academic_average)}</td>
                  <td className={`py-2.5 text-center font-semibold ${color(r.attendance_rate)}`}>{fmtPct(r.attendance_rate)}</td>
                  <td className="py-2.5 text-center text-gray-600">{fmtPct(r.completion_rate)}</td>
                  <td className="py-2.5 text-center">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.at_risk > 0 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-400"}`}>{r.at_risk}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Banner = ({ text, tone = "amber" }: { text: string; tone?: "amber" | "red" }) => (
  <div className={`text-xs rounded-lg px-3 py-2 border ${
    tone === "red" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-900"
  }`}>
    {text}
  </div>
);

export default TeachingOverview;
