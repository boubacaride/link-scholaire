"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import {
  Panel, SummaryStat, MiniStat, AttendanceRing, AlertRow, EmptyHint, gradeColor,
} from "@/components/dashboard/PortalUI";

interface ChildMonitorProps {
  studentId: string;
  studentName: string;
}

interface Grade { id: string; subject_name: string; score: number; max_score: number; exam_type: string; term: string; remarks: string | null; created_at: string; }
interface Att { id: string; date: string; status: string; }
interface Upcoming { id: string; title: string; due_date: string | null; type: string; subject_name: string; submitted: boolean; }

/** Read-only academic portal for a single child, modelled on the ProgressBook
 *  ParentAccess dashboard: a summary strip, alerts, then discrete panels for
 *  Grades & coursework, Daily Attendance, Homework (due soon) and Teacher
 *  comments. Data loading is RLS-safe (parent reads via is_parent_of). */
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

      // Grades (with teacher remarks for the "Comments" panel)
      const { data: gradeData } = await supabase
        .from("grades")
        .select("id, subject_id, score, max_score, exam_type, term, remarks, created_at, subject:subject_id(name)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      setGrades((gradeData || []).map((g: any) => ({
        id: g.id, subject_name: g.subject?.name || "", score: g.score, max_score: g.max_score,
        exam_type: g.exam_type || "", term: g.term || "", remarks: g.remarks || null, created_at: g.created_at,
      })));

      // Which assignments already have a posted grade (matched by subject +
      // title) — these are done, so they must not count as missing/upcoming.
      const gKey = (subjectId: string, examType: string) =>
        `${subjectId}|::|${(examType || "").trim().toLowerCase()}`;
      const gradedKeys = new Set<string>(
        (gradeData || []).map((g: any) => gKey(g.subject_id, g.exam_type))
      );

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
          .select("id, title, due_date, type, subject_id, subject:subject_id(name)")
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
        // "done" = turned in OR already graded (a grade exists for it).
        const up: Upcoming[] = (content || []).map((c: any) => ({
          id: c.id, title: c.title, due_date: c.due_date, type: c.type,
          subject_name: c.subject?.name || "",
          submitted: submittedSet.has(c.id) || gradedKeys.has(gKey(c.subject_id, c.title)),
        }));
        setMissingCount(up.filter((u) => u.due_date && new Date(u.due_date).getTime() < now && !u.submitted).length);
        setUpcoming(up.filter((u) => u.due_date && new Date(u.due_date).getTime() >= now && !u.submitted));
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

  const attStats = useMemo(() => {
    const present = attendance.filter((a) => a.status === "present").length;
    const tardies = attendance.filter((a) => a.status === "late").length;
    const absences = attendance.filter((a) => a.status === "absent").length;
    const excused = attendance.filter((a) => a.status === "excused").length;
    const total = attendance.length;
    const rate = total ? ((present + tardies) / total) * 100 : null;
    return { present, tardies, absences, excused, total, rate };
  }, [attendance]);

  const recentAbsence = useMemo(
    () => attendance.find((a) => a.status === "absent") || null,
    [attendance]
  );

  // Homework grouped by subject, with a per-subject count (ProgressBook style).
  const homeworkBySubject = useMemo(() => {
    const m = new Map<string, Upcoming[]>();
    upcoming.forEach((u) => {
      const arr = m.get(u.subject_name) || [];
      arr.push(u);
      m.set(u.subject_name, arr);
    });
    return Array.from(m.entries())
      .map(([subject, items]) => ({ subject: subject || "—", items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [upcoming]);

  const comments = useMemo(
    () => grades.filter((g) => g.remarks && g.remarks.trim()).slice(0, 5),
    [grades]
  );

  const dueSoon = (d: string | null) =>
    d != null && new Date(d).getTime() - Date.now() < 3 * 86400000;

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading {studentName}&apos;s records…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Summary strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat
          label={t("wdg.avgGrade")}
          value={avg === null ? "—" : `${avg.toFixed(0)}%`}
          accent="emerald"
          icon="🎯"
          valueClass={avg === null ? "text-gray-400" : gradeColor(avg)}
        />
        <SummaryStat
          label={t("wdg.attendance")}
          value={attStats.rate === null ? "—" : `${attStats.rate.toFixed(0)}%`}
          accent="sky"
          icon="📅"
        />
        <SummaryStat
          label="Missing"
          value={String(missingCount)}
          accent={missingCount > 0 ? "red" : "slate"}
          icon="⚠️"
          valueClass={missingCount > 0 ? "text-red-600" : "text-gray-700"}
        />
        <SummaryStat
          label="Due soon"
          value={String(upcoming.length)}
          accent="amber"
          icon="📝"
        />
      </div>

      {/* ── Alerts ────────────────────────────────────────────────────── */}
      {(missingCount > 0 || recentAbsence || (avg !== null && avg < 50)) && (
        <div className="space-y-2">
          {missingCount > 0 && (
            <AlertRow
              tone="red"
              title="Missing work"
              detail={`${missingCount} assignment${missingCount !== 1 ? "s" : ""} past due and not submitted`}
            />
          )}
          {recentAbsence && (
            <AlertRow
              tone="orange"
              title="Absence recorded"
              detail={`Marked absent on ${new Date(recentAbsence.date).toLocaleDateString()}`}
            />
          )}
          {avg !== null && avg < 50 && (
            <AlertRow
              tone="yellow"
              title="Grades need attention"
              detail={`Current average is ${avg.toFixed(0)}%`}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Grades & coursework ─────────────────────────────────────── */}
        <Panel title="Grades & coursework" icon="📊" accent="indigo" className="lg:row-span-2">
          <ProgressTracker studentId={studentId} />
        </Panel>

        {/* ── Daily attendance ────────────────────────────────────────── */}
        <Panel title="Daily attendance" icon="📅" accent="sky">
          {attStats.total === 0 ? (
            <EmptyHint text={t("wdg.noAttendance")} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <AttendanceRing rate={attStats.rate ?? 0} />
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <MiniStat label="Absences" value={attStats.absences} tone="red" />
                  <MiniStat label="Tardies" value={attStats.tardies} tone="amber" />
                  <MiniStat label="Present" value={attStats.present} tone="green" />
                  <MiniStat label="Excused" value={attStats.excused} tone="sky" />
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t("wdg.recentAttendance")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {attendance.slice(0, 12).map((a) => (
                    <span key={a.id} className={`text-[11px] px-2 py-1 rounded-lg font-medium ${
                      a.status === "present" ? "bg-green-50 text-green-700" :
                      a.status === "late" ? "bg-amber-50 text-amber-700" :
                      a.status === "excused" ? "bg-sky-50 text-sky-700" :
                      "bg-red-50 text-red-700"
                    }`}>
                      {new Date(a.date).toLocaleDateString([], { month: "short", day: "numeric" })} · {a.status}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Panel>

        {/* ── Homework / due soon ─────────────────────────────────────── */}
        <Panel title="Homework — due soon" icon="📝" accent="amber">
          {homeworkBySubject.length === 0 ? (
            <EmptyHint text="Nothing due soon. 🎉" />
          ) : (
            <div className="space-y-3">
              {homeworkBySubject.map((group) => (
                <div key={group.subject}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
                      {group.items.length}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{group.subject}</span>
                  </div>
                  <div className="space-y-1.5 ml-1">
                    {group.items.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-sm text-gray-800 truncate">{u.title}</p>
                        {u.due_date && (
                          <span className={`text-[11px] font-medium shrink-0 ${dueSoon(u.due_date) ? "text-red-600" : "text-gray-500"}`}>
                            {dueSoon(u.due_date) ? "Due " : ""}{new Date(u.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Grade details (recent activity) ───────────────────────────── */}
      <Panel title="Grade details" icon="🎓" accent="emerald">
        {grades.length === 0 ? (
          <EmptyHint text={t("wdg.noGrades")} />
        ) : (
          <div className="divide-y divide-gray-100">
            {grades.slice(0, 8).map((g) => {
              const pct = (g.score / g.max_score) * 100;
              return (
                <div key={g.id} className="flex items-center gap-3 py-2.5">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shrink-0 ${
                    pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 50 ? "bg-orange-500" : "bg-red-500"
                  }`}>{Math.round(pct)}%</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{g.subject_name}</p>
                    <p className="text-[11px] text-gray-400">
                      {g.exam_type}{g.term ? ` • ${g.term}` : ""}
                      {g.created_at ? ` • ${new Date(g.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
                    </p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${gradeColor(pct)}`}>{g.score}/{g.max_score}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Teacher comments ──────────────────────────────────────────── */}
      {comments.length > 0 && (
        <Panel title="Teacher comments" icon="💬" accent="purple">
          <div className="space-y-2.5">
            {comments.map((g) => (
              <div key={g.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {(g.subject_name[0] || "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 bg-purple-50/60 border border-purple-100 rounded-xl rounded-tl-none px-3 py-2">
                  <p className="text-[11px] font-semibold text-purple-700">
                    {g.subject_name}
                    <span className="font-normal text-purple-400"> · {g.exam_type}</span>
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">{g.remarks}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
};

export default ChildMonitor;
