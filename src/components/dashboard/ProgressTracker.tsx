"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface GradeRow {
  subject_id: string;
  subject_name: string;
  score: number;
  max_score: number;
  created_at: string;
}

interface ProgressTrackerProps {
  /** Whose progress to show. Defaults to the signed-in user (student view). */
  studentId?: string;
}

/** Per-subject progress: average performance, number of grades and a simple
 *  improving/declining trend. Reused for students and (read-only) parents. */
const ProgressTracker = ({ studentId }: ProgressTrackerProps) => {
  const { user } = useAuth();
  const supabase = createClient();
  const targetId = studentId || user?.profileId;

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !targetId) { setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("grades")
        .select("subject_id, score, max_score, created_at, subject:subject_id(name)")
        .eq("student_id", targetId)
        .order("created_at", { ascending: true });
      setGrades(
        (data || []).map((g: any) => ({
          subject_id: g.subject_id,
          subject_name: g.subject?.name || "Subject",
          score: g.score,
          max_score: g.max_score,
          created_at: g.created_at,
        }))
      );
      setLoading(false);
    };
    load();
  }, [targetId]);

  const subjects = useMemo(() => {
    const map = new Map<string, GradeRow[]>();
    for (const g of grades) {
      const arr = map.get(g.subject_id) || [];
      arr.push(g);
      map.set(g.subject_id, arr);
    }
    return Array.from(map.entries()).map(([id, rows]) => {
      const pcts = rows.map((r) => (r.score / r.max_score) * 100);
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      // trend: average of the most recent half vs the earlier half
      let trend = 0;
      if (pcts.length >= 2) {
        const mid = Math.floor(pcts.length / 2);
        const earlier = pcts.slice(0, mid);
        const recent = pcts.slice(mid);
        const ea = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
        trend = ra - ea;
      }
      return { id, name: rows[0].subject_name, avg, count: rows.length, trend };
    }).sort((a, b) => b.avg - a.avg);
  }, [grades]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading progress...</div>;

  if (subjects.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">📋</div>
        <p className="text-gray-500 text-sm">No graded subjects yet.</p>
        <p className="text-gray-400 text-xs mt-1">Progress shows up once grades are recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subjects.map((s) => {
        const color = s.avg >= 80 ? "bg-green-500" : s.avg >= 60 ? "bg-blue-500" : s.avg >= 50 ? "bg-orange-500" : "bg-red-500";
        return (
          <div key={s.id}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
                <span className="text-[10px] text-gray-400">{s.count} grade{s.count !== 1 ? "s" : ""}</span>
                {Math.abs(s.trend) >= 1 && (
                  <span className={`text-[10px] font-medium ${s.trend > 0 ? "text-green-600" : "text-red-500"}`}>
                    {s.trend > 0 ? "▲" : "▼"} {Math.abs(s.trend).toFixed(0)}%
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-700">{s.avg.toFixed(0)}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, s.avg)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProgressTracker;
