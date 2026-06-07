"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface GradePoint { created_at: string; score: number; max_score: number; }
interface AttPoint { date: string; status: string; }

/** Teacher analytics: attendance rate over time and grade trends/distribution
 *  across all the teacher's classes, at a glance. */
const TeacherAnalytics = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const [grades, setGrades] = useState<GradePoint[]>([]);
  const [attendance, setAttendance] = useState<AttPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }

      const { data: cs } = await supabase
        .from("class_subjects")
        .select("class_id")
        .eq("teacher_id", user.profileId);
      const classIds = Array.from(new Set((cs || []).map((c: any) => c.class_id)));

      const { data: gradeData } = await supabase
        .from("grades")
        .select("created_at, score, max_score")
        .eq("recorded_by", user.profileId)
        .order("created_at", { ascending: true });
      setGrades((gradeData as GradePoint[]) || []);

      if (classIds.length > 0) {
        const { data: attData } = await supabase
          .from("attendance")
          .select("date, status")
          .in("class_id", classIds)
          .order("date", { ascending: true });
        setAttendance((attData as AttPoint[]) || []);
      }
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  // ── Grade trend: average % per calendar day ──
  const gradeTrend = useMemo(() => {
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const g of grades) {
      const day = new Date(g.created_at).toLocaleDateString([], { month: "short", day: "numeric" });
      const e = byDay.get(day) || { sum: 0, n: 0 };
      e.sum += (g.score / g.max_score) * 100; e.n += 1;
      byDay.set(day, e);
    }
    return Array.from(byDay.entries()).map(([day, e]) => ({ day, avg: Math.round(e.sum / e.n) }));
  }, [grades]);

  // ── Grade distribution bands ──
  const distribution = useMemo(() => {
    const bands = [
      { name: "0-49", color: "#ef4444", count: 0 },
      { name: "50-59", color: "#f97316", count: 0 },
      { name: "60-69", color: "#eab308", count: 0 },
      { name: "70-79", color: "#3b82f6", count: 0 },
      { name: "80-100", color: "#22c55e", count: 0 },
    ];
    for (const g of grades) {
      const pct = (g.score / g.max_score) * 100;
      if (pct < 50) bands[0].count++;
      else if (pct < 60) bands[1].count++;
      else if (pct < 70) bands[2].count++;
      else if (pct < 80) bands[3].count++;
      else bands[4].count++;
    }
    return bands;
  }, [grades]);

  // ── Attendance trend: present rate per date ──
  const attTrend = useMemo(() => {
    const byDay = new Map<string, { present: number; total: number }>();
    for (const a of attendance) {
      const e = byDay.get(a.date) || { present: 0, total: 0 };
      e.total += 1;
      if (a.status === "present" || a.status === "late") e.present += 1;
      byDay.set(a.date, e);
    }
    return Array.from(byDay.entries())
      .slice(-14)
      .map(([date, e]) => ({
        day: new Date(date).toLocaleDateString([], { month: "short", day: "numeric" }),
        rate: e.total > 0 ? Math.round((e.present / e.total) * 100) : 0,
      }));
  }, [attendance]);

  const kpis = useMemo(() => {
    const gAvg = grades.length
      ? grades.reduce((s, g) => s + (g.score / g.max_score) * 100, 0) / grades.length
      : null;
    const present = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    const attRate = attendance.length ? (present / attendance.length) * 100 : null;
    return { gAvg, attRate, gradeCount: grades.length, attCount: attendance.length };
  }, [grades, attendance]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading analytics...</div>;

  const hasData = grades.length > 0 || attendance.length > 0;
  if (!hasData) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">📈</div>
        <p className="text-gray-500 text-sm">No analytics yet.</p>
        <p className="text-gray-400 text-xs mt-1">Record grades and attendance to see trends here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-[10px] text-blue-500 uppercase tracking-wide">Avg Grade</p>
          <p className="text-xl font-bold text-blue-700">{kpis.gAvg === null ? "—" : `${kpis.gAvg.toFixed(0)}%`}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3">
          <p className="text-[10px] text-green-500 uppercase tracking-wide">Attendance</p>
          <p className="text-xl font-bold text-green-700">{kpis.attRate === null ? "—" : `${kpis.attRate.toFixed(0)}%`}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3">
          <p className="text-[10px] text-purple-500 uppercase tracking-wide">Grades Logged</p>
          <p className="text-xl font-bold text-purple-700">{kpis.gradeCount}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3">
          <p className="text-[10px] text-orange-500 uppercase tracking-wide">Att. Records</p>
          <p className="text-xl font-bold text-orange-700">{kpis.attCount}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Attendance trend */}
        <div className="border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Attendance Trend</h3>
          {attTrend.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No attendance recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={attTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Present"]} />
                <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Grade trend */}
        <div className="border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Grade Trend</h3>
          {gradeTrend.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No grades recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={gradeTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Avg"]} />
                <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Grade distribution */}
        <div className="border rounded-xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Grade Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, "Students"]} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {distribution.map((b) => <Cell key={b.name} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default TeacherAnalytics;
