"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import ProgressTracker from "@/components/dashboard/ProgressTracker";

interface ChildMonitorProps {
  studentId: string;
  studentName: string;
}

interface Grade { id: string; subject_name: string; score: number; max_score: number; exam_type: string; term: string; created_at: string; }
interface Att { id: string; date: string; status: string; }
interface Upcoming { id: string; title: string; due_date: string | null; type: string; subject_name: string; submitted: boolean; }

interface Alert { kind: "missing" | "attendance" | "grade"; title: string; detail: string; }

const ALERT_STYLES: Record<Alert["kind"], { box: string; title: string; detail: string }> = {
  missing: { box: "bg-red-50 border-red-100", title: "text-red-700", detail: "text-red-500" },
  attendance: { box: "bg-orange-50 border-orange-100", title: "text-orange-700", detail: "text-orange-500" },
  grade: { box: "bg-yellow-50 border-yellow-100", title: "text-yellow-700", detail: "text-yellow-600" },
};

/** Read-only academic snapshot of a single child for the parent dashboard:
 *  grades, attendance, upcoming work, and derived alerts. */
const ChildMonitor = ({ studentId, studentName }: ChildMonitorProps) => {
  const supabase = createClient();
  const { t } = useI18n();

  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !studentId) { setLoading(false); return; }
      setLoading(true);

      // Grades
      const { data: gradeData } = await supabase
        .from("grades")
        .select("id, score, max_score, exam_type, term, created_at, subject:subject_id(name)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      setGrades((gradeData || []).map((g: any) => ({
        id: g.id, subject_name: g.subject?.name || "", score: g.score, max_score: g.max_score,
        exam_type: g.exam_type || "", term: g.term || "", created_at: g.created_at,
      })));

      // Attendance
      const { data: attData } = await supabase
        .from("attendance")
        .select("id, date, status")
        .eq("student_id", studentId)
        .order("date", { ascending: false });
      setAttendance((attData as Att[]) || []);

      // Upcoming assignments (across the child's classes)
      const { data: enrollments } = await supabase
        .from("student_classes")
        .select("class_id")
        .eq("student_id", studentId);
      const classIds = (enrollments || []).map((e: any) => e.class_id);
      if (classIds.length > 0) {
        const { data: content } = await supabase
          .from("content")
          .select("id, title, due_date, type, subject:subject_id(name)")
          .in("class_id", classIds)
          .in("type", ["assignment", "classwork"])
          .eq("is_published", true)
          .order("due_date", { ascending: true });

        const contentIds = (content || []).map((c: any) => c.id);
        const submittedSet = new Set<string>();
        if (contentIds.length > 0) {
          const { data: subs } = await supabase
            .from("submissions")
            .select("content_id, status")
            .eq("student_id", studentId)
            .in("content_id", contentIds);
          (subs || []).forEach((s: any) => { if (s.status !== "pending") submittedSet.add(s.content_id); });
        }

        const now = Date.now();
        const up: Upcoming[] = (content || []).map((c: any) => ({
          id: c.id, title: c.title, due_date: c.due_date, type: c.type,
          subject_name: c.subject?.name || "", submitted: submittedSet.has(c.id),
        }));
        // missing = past due & not submitted
        setMissingCount(up.filter((u) => u.due_date && new Date(u.due_date).getTime() < now && !u.submitted).length);
        // upcoming = due in the future & not submitted
        setUpcoming(up.filter((u) => u.due_date && new Date(u.due_date).getTime() >= now && !u.submitted).slice(0, 6));
      } else {
        setUpcoming([]); setMissingCount(0);
      }

      setLoading(false);
    };
    load();
  }, [studentId]);

  const avg = useMemo(() => grades.length
    ? grades.reduce((s, g) => s + (g.score / g.max_score) * 100, 0) / grades.length
    : null, [grades]);

  const attRate = useMemo(() => {
    if (attendance.length === 0) return null;
    const present = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    return (present / attendance.length) * 100;
  }, [attendance]);

  const recentAbsences = useMemo(
    () => attendance.filter((a) => a.status === "absent").slice(0, 3),
    [attendance]
  );

  const alerts = useMemo<Alert[]>(() => {
    const list: Alert[] = [];
    if (missingCount > 0) {
      list.push({ kind: "missing", title: "Missing work", detail: `${missingCount} assignment${missingCount !== 1 ? "s" : ""} past due and not submitted` });
    }
    recentAbsences.forEach((a) => {
      list.push({ kind: "attendance", title: "Absence recorded", detail: `Marked absent on ${new Date(a.date).toLocaleDateString()}` });
    });
    if (avg !== null && avg < 50) {
      list.push({ kind: "grade", title: "Grades need attention", detail: `Current average is ${avg.toFixed(0)}%` });
    }
    return list;
  }, [missingCount, recentAbsences, avg]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading {studentName}&apos;s records...</div>;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-green-500 uppercase tracking-wide">{t("wdg.avgGrade")}</p>
          <p className="text-xl font-bold text-green-700">{avg === null ? "—" : `${avg.toFixed(0)}%`}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-blue-500 uppercase tracking-wide">{t("wdg.attendance")}</p>
          <p className="text-xl font-bold text-blue-700">{attRate === null ? "—" : `${attRate.toFixed(0)}%`}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-orange-500 uppercase tracking-wide">{t("wdg.upcoming")}</p>
          <p className="text-xl font-bold text-orange-700">{upcoming.length}</p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{t("wdg.alerts")}</h3>
          {alerts.map((a, i) => {
            const cls = ALERT_STYLES[a.kind];
            return (
              <div key={i} className={`p-3 rounded-lg border ${cls.box}`}>
                <p className={`text-sm font-medium ${cls.title}`}>{a.title}</p>
                <p className={`text-xs ${cls.detail} mt-0.5`}>{a.detail}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Subject progress */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("wdg.subjectProgress")}</h3>
        <ProgressTracker studentId={studentId} />
      </div>

      {/* Upcoming assignments */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("wdg.upcomingAssignments")}</h3>
        {upcoming.length === 0 ? (
          <p className="text-xs text-gray-400">Nothing due soon. 🎉</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{u.title}</p>
                  <p className="text-xs text-gray-400">{u.subject_name}</p>
                </div>
                {u.due_date && (
                  <span className="text-[11px] text-orange-600 font-medium shrink-0">
                    Due {new Date(u.due_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent grades */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("wdg.recentGrades")}</h3>
        {grades.length === 0 ? (
          <p className="text-xs text-gray-400">{t("wdg.noGrades")}</p>
        ) : (
          <div className="space-y-1.5">
            {grades.slice(0, 6).map((g) => {
              const pct = (g.score / g.max_score) * 100;
              return (
                <div key={g.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                  <span className="text-gray-700">{g.subject_name}</span>
                  <span className="text-xs text-gray-400">{g.exam_type}{g.term ? ` • ${g.term}` : ""}</span>
                  <span className={`font-semibold ${pct >= 70 ? "text-green-600" : pct >= 50 ? "text-orange-600" : "text-red-600"}`}>
                    {g.score}/{g.max_score}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent attendance */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("wdg.recentAttendance")}</h3>
        {attendance.length === 0 ? (
          <p className="text-xs text-gray-400">{t("wdg.noAttendance")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attendance.slice(0, 10).map((a) => (
              <div key={a.id} className={`text-[11px] px-2 py-1 rounded-lg font-medium ${
                a.status === "present" ? "bg-green-100 text-green-700" :
                a.status === "late" ? "bg-yellow-100 text-yellow-700" :
                a.status === "excused" ? "bg-blue-100 text-blue-700" :
                "bg-red-100 text-red-700"
              }`}>
                {new Date(a.date).toLocaleDateString([], { month: "short", day: "numeric" })} · {a.status}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChildMonitor;
