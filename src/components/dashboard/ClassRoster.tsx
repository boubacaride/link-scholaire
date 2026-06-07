"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface ClassOption {
  class_id: string;
  class_name: string;
  class_grade: number | string;
}

interface RosterStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  present: number;
  absent: number;
  total: number;
}

/** Teacher roster view: see who is enrolled in each class, their contact
 *  details and an attendance snapshot. */
const ClassRoster = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }
      const { data } = await supabase
        .from("class_subjects")
        .select("class_id, classes:class_id(name, grade)")
        .eq("teacher_id", user.profileId);
      const unique = new Map<string, ClassOption>();
      (data || []).forEach((cs: any) => {
        if (!unique.has(cs.class_id)) {
          unique.set(cs.class_id, {
            class_id: cs.class_id,
            class_name: cs.classes?.name || "Class",
            class_grade: cs.classes?.grade ?? "—",
          });
        }
      });
      const list = Array.from(unique.values());
      setClasses(list);
      if (list.length > 0) setClassId(list[0].class_id);
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !classId) return;
      setLoadingRoster(true);
      const { data: enrollments } = await supabase
        .from("student_classes")
        .select("student:student_id(id, first_name, last_name, email, phone, gender)")
        .eq("class_id", classId);

      const roster: RosterStudent[] = (enrollments || [])
        .map((e: any) => e.student)
        .filter(Boolean)
        .map((s: any) => ({ ...s, present: 0, absent: 0, total: 0 }));

      // Attendance snapshot for this class
      const { data: att } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", classId);
      const byStudent: Record<string, { present: number; absent: number; total: number }> = {};
      (att || []).forEach((a: any) => {
        const e = byStudent[a.student_id] || { present: 0, absent: 0, total: 0 };
        e.total += 1;
        if (a.status === "present" || a.status === "late") e.present += 1;
        if (a.status === "absent") e.absent += 1;
        byStudent[a.student_id] = e;
      });
      roster.forEach((s) => {
        const e = byStudent[s.id];
        if (e) { s.present = e.present; s.absent = e.absent; s.total = e.total; }
      });
      roster.sort((a, b) => a.first_name.localeCompare(b.first_name));
      setStudents(roster);
      setLoadingRoster(false);
    };
    load();
  }, [classId]);

  const selected = classes.find((c) => c.class_id === classId);

  const summary = useMemo(() => {
    const totalSessions = students.reduce((s, x) => s + x.total, 0);
    const totalPresent = students.reduce((s, x) => s + x.present, 0);
    return {
      count: students.length,
      attendanceRate: totalSessions > 0 ? (totalPresent / totalSessions) * 100 : null,
    };
  }, [students]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading roster...</div>;

  if (classes.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">👥</div>
        <p className="text-gray-500 text-sm">No classes assigned yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Class</label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>{c.class_name} (Grade {c.class_grade})</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-blue-500 uppercase tracking-wide">Enrolled</p>
            <p className="text-lg font-bold text-blue-700">{summary.count}</p>
          </div>
          <div className="bg-green-50 rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-green-500 uppercase tracking-wide">Attendance</p>
            <p className="text-lg font-bold text-green-700">
              {summary.attendanceRate === null ? "—" : `${summary.attendanceRate.toFixed(0)}%`}
            </p>
          </div>
        </div>
      </div>

      {loadingRoster ? (
        <div className="p-6 text-center text-gray-400 text-sm">Loading {selected?.class_name}...</div>
      ) : students.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 text-sm">No students enrolled in this class.</p>
          <p className="text-gray-400 text-xs mt-1">Enrollment is managed by your school administrator.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {students.map((s) => {
            const rate = s.total > 0 ? (s.present / s.total) * 100 : null;
            return (
              <div key={s.id} className="flex items-center gap-3 border rounded-xl p-3 hover:shadow-sm transition-shadow">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0">
                  {s.first_name[0]}{s.last_name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-xs text-gray-400 truncate">{s.email || "No email"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400 uppercase">Present</p>
                  <p className={`text-sm font-semibold ${rate === null ? "text-gray-300" : rate >= 90 ? "text-green-600" : rate >= 75 ? "text-orange-600" : "text-red-600"}`}>
                    {rate === null ? "—" : `${rate.toFixed(0)}%`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClassRoster;
