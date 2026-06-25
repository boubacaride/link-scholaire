"use client";

// Last-5-weekdays present/absent bar chart. Pulls real numbers from
// the attendance_last5_weekdays() RPC (migration 034) — no more
// hardcoded Mon-Fri demo array.

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

interface Row {
  day_iso: string;
  weekday: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

const AttendanceChart = () => {
  const supabase = createClient();
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data: rows, error } = await supabase.rpc("attendance_last5_weekdays");
      if (error) {
        // Surface the error in the console; render empty state.
        console.warn("[AttendanceChart] rpc failed:", error.message);
        setData([]);
      } else {
        setData((rows as Row[]) ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const hasAny = data.some((r) => r.present + r.absent + r.late + r.excused > 0);

  // recharts wants name + numeric series. Map server rows into that shape.
  const chartData = data.map((r) => ({
    name: r.weekday.trim(),
    present: r.present,
    absent: r.absent,
  }));

  return (
    <div className="bg-white rounded-lg p-4 h-full">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Attendance</h1>
        <Image src="/moreDark.png" alt="" width={20} height={20} />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
      ) : !hasAny ? (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500">No attendance recorded yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Teachers can record attendance from <em>List → Attendance → Take Attendance</em>.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="90%">
          <BarChart width={500} height={300} data={chartData} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ddd" />
            <XAxis dataKey="name" axisLine={false} tick={{ fill: "#9ca3af" }} tickLine={false} />
            <YAxis axisLine={false} tick={{ fill: "#9ca3af" }} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: "10px", borderColor: "lightgray" }} />
            <Legend align="left" verticalAlign="top"
              wrapperStyle={{ paddingTop: "20px", paddingBottom: "40px" }} />
            <Bar dataKey="present" fill="#10b981" legendType="circle" radius={[10, 10, 0, 0]} />
            <Bar dataKey="absent"  fill="#f97316" legendType="circle" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default AttendanceChart;
