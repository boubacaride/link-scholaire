"use client";

// Teaching Overview — per-teacher performance from the perf_teachers RPC
// (migration 042): academic average of their students in the subjects they
// teach, attendance of their classes, pass rate, and at-risk count.
// Sortable table; admin-only data is enforced server-side.

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { gradeColor } from "@/components/dashboard/PortalUI";

interface Row {
  teacher_id: string; teacher_name: string;
  classes: number; subjects: number; students: number;
  academic_average: number | null; attendance_rate: number | null;
  pass_rate: number | null; at_risk: number;
}
type Sort = "name" | "academic" | "attendance" | "atrisk";

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`;
const color = (v: number | null | undefined) =>
  v === null || v === undefined ? "text-gray-400" : gradeColor(Number(v));
const isMissingRpc = (msg?: string) =>
  !!msg && /could not find the function|does not exist|PGRST202|schema cache/i.test(msg);

const TeachingOverview = () => {
  const { t } = useI18n();
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [rpcMissing, setRpcMissing] = useState(false);
  const [sort, setSort] = useState<Sort>("name");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      setRpcMissing(false);
      const { data, error } = await supabase.rpc("perf_teachers", {});
      if (error) { if (isMissingRpc(error.message)) setRpcMissing(true); setRows([]); }
      else setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const sorted = useMemo(() => {
    const r = [...rows];
    if (sort === "name") r.sort((a, b) => a.teacher_name.localeCompare(b.teacher_name));
    else if (sort === "academic") r.sort((a, b) => (b.academic_average ?? -1) - (a.academic_average ?? -1));
    else if (sort === "attendance") r.sort((a, b) => (b.attendance_rate ?? -1) - (a.attendance_rate ?? -1));
    else r.sort((a, b) => b.at_risk - a.at_risk);
    return r;
  }, [rows, sort]);

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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{t("perf.teachingTitle")}</h2>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <span>{t("perf.sortBy")}:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="border border-gray-200 rounded px-1.5 py-1">
            <option value="name">{t("perf.sortName")}</option>
            <option value="academic">{t("perf.sortAcademic")}</option>
            <option value="attendance">{t("perf.sortAttendance")}</option>
            <option value="atrisk">{t("perf.colAtRisk")}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">{t("perf.loading")}</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{t("perf.emptyLevel")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
              <tr>
                <th className="text-left py-2">{t("perf.colTeacher")}</th>
                <th className="text-center py-2">{t("perf.colClasses")}</th>
                <th className="text-center py-2">{t("perf.colSubjects")}</th>
                <th className="text-center py-2">{t("perf.colStudents")}</th>
                <th className="text-center py-2">{t("perf.colAcademic")}</th>
                <th className="text-center py-2">{t("perf.colAttendance")}</th>
                <th className="text-center py-2">{t("perf.colPassRate")}</th>
                <th className="text-center py-2">{t("perf.colAtRisk")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.teacher_id} className="border-b hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-800">{r.teacher_name}</td>
                  <td className="py-2.5 text-center text-gray-600">{r.classes}</td>
                  <td className="py-2.5 text-center text-gray-600">{r.subjects}</td>
                  <td className="py-2.5 text-center text-gray-600">{r.students}</td>
                  <td className={`py-2.5 text-center font-semibold ${color(r.academic_average)}`}>{fmtPct(r.academic_average)}</td>
                  <td className={`py-2.5 text-center font-semibold ${color(r.attendance_rate)}`}>{fmtPct(r.attendance_rate)}</td>
                  <td className="py-2.5 text-center text-gray-600">{fmtPct(r.pass_rate)}</td>
                  <td className="py-2.5 text-center">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.at_risk > 0 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-400"}`}>{r.at_risk}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeachingOverview;
