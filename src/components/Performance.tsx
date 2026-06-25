"use client";

// Today's school-wide attendance summary, rendered as a present /
// absent donut. The previous version showed a hardcoded 92 / 8 demo
// split; this one reads real numbers from the last weekday with any
// recorded attendance via the attendance_last5_weekdays() RPC
// (migration 034). Falls back to an empty state when nothing has
// been recorded yet so a brand-new school doesn't see fake data.

import { useEffect, useState } from "react";
import Image from "next/image";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface RpcRow {
  day_iso: string;
  weekday: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

const Performance = () => {
  const { t } = useI18n();
  const supabase = createClient();
  const [today, setToday] = useState<RpcRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc("attendance_last5_weekdays");
      if (error || !data) { setLoading(false); return; }
      const rows = (data as RpcRow[]) ?? [];
      // Pick the most recent weekday that actually has data; falls
      // back to the latest row if none have data so the chart never
      // shows misleading historical numbers.
      const withData = rows.filter((r) =>
        r.present + r.absent + r.late + r.excused > 0,
      );
      setToday((withData[withData.length - 1] ?? rows[rows.length - 1]) ?? null);
      setLoading(false);
    })();
  }, []);

  const totals = today
    ? { present: today.present, absent: today.absent + today.late + today.excused }
    : { present: 0, absent: 0 };
  const total = totals.present + totals.absent;
  const presentPct = total > 0 ? Math.round((totals.present / total) * 100) : null;

  const chartData = total > 0
    ? [
        { name: "Present", value: totals.present, fill: "#10b981" },
        { name: "Absent",  value: totals.absent,  fill: "#f97316" },
      ]
    : null;

  return (
    <div className="bg-white p-4 rounded-md h-80 relative">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("ui.performance")}</h1>
        <Image src="/moreDark.png" alt="" width={16} height={16} />
      </div>
      {loading ? (
        <p className="text-sm text-gray-400 text-center mt-16">…</p>
      ) : chartData ? (
        <>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                dataKey="value"
                startAngle={180}
                endAngle={0}
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
              >
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <h1 className="text-3xl font-bold">{presentPct}%</h1>
            <p className="text-xs text-gray-400">present today</p>
          </div>
          <h2 className="font-medium absolute bottom-12 left-0 right-0 m-auto text-center text-sm text-gray-600">
            {totals.present} present · {totals.absent} away
          </h2>
        </>
      ) : (
        <div className="text-center mt-16">
          <p className="text-sm text-gray-500">No attendance recorded yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Once teachers start submitting, today's % shows here.
          </p>
        </div>
      )}
    </div>
  );
};

export default Performance;
