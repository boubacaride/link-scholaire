"use client";

// Month-over-month trend: academic average (bars, left axis) + attendance
// rate (line, right axis) on a dual-axis ComposedChart. Both are 0–100
// percentages but kept on separate axes per the executive-dashboard design.
// Purely presentational — the page computes the series from
// performance_snapshots and passes labels for i18n.

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface TrendPoint {
  label: string;                 // e.g. "Jun 2026"
  academic: number | null;       // 0..100
  attendance: number | null;     // 0..100
}

interface Props {
  data: TrendPoint[];
  academicLabel: string;
  attendanceLabel: string;
  emptyLabel: string;
}

// Indigo bars + amber line — a colorblind-safe pairing.
const ACADEMIC = "#4f46e5";
const ATTENDANCE = "#f59e0b";

const TrendChart = ({ data, academicLabel, attendanceLabel, emptyLabel }: Props) => {
  const hasData = data.some((d) => d.academic !== null || d.attendance !== null);
  if (!hasData) {
    return (
      <div className="h-full min-h-[260px] flex items-center justify-center text-sm text-gray-400 text-center px-6">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} />
        <YAxis
          yAxisId="left"
          domain={[0, 100]}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          label={{ value: academicLabel, angle: -90, position: "insideLeft", style: { fill: ACADEMIC, fontSize: 12 } }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "#6b7280", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          label={{ value: attendanceLabel, angle: 90, position: "insideRight", style: { fill: ATTENDANCE, fontSize: 12 } }}
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            value === null ? ["—", name] : [`${Number(value).toFixed(1)}%`, name]
          }
        />
        <Legend />
        <Bar yAxisId="left" dataKey="academic" name={academicLabel} fill={ACADEMIC} radius={[4, 4, 0, 0]} maxBarSize={48} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="attendance"
          name={attendanceLabel}
          stroke={ATTENDANCE}
          strokeWidth={3}
          dot={{ r: 4 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default TrendChart;
