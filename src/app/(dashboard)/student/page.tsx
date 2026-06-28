"use client";

import { useEffect, useMemo, useState } from "react";
import { computeAttendanceRate } from "@/lib/attendance/rate";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import Performance from "@/components/Performance";
import Messaging from "@/components/Messaging";
import StudentAssignments from "@/components/dashboard/StudentAssignments";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import GradesPortal from "@/components/dashboard/GradesPortal";
import { Panel, SummaryStat, MiniStat, AttendanceRing, EmptyHint, gradeColor, gradeBg } from "@/components/dashboard/PortalUI";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface EnrolledClass {
  class_id: string;
  class_name: string;
  class_grade: string;
}

interface Att { id: string; date: string; status: string; }

interface Grade {
  id: string;
  subject_name: string;
  score: number;
  max_score: number;
  exam_type: string;
  term: string;
  remarks: string | null;
}

type Tab = "overview" | "assignments" | "grades" | "progress" | "messages";

const TABS: { id: Tab; tabKey: string; icon: string }[] = [
  { id: "overview", tabKey: "dash.tabs.overview", icon: "🏠" },
  { id: "assignments", tabKey: "dash.tabs.assignments", icon: "📝" },
  { id: "grades", tabKey: "dash.tabs.grades", icon: "🎯" },
  { id: "progress", tabKey: "dash.tabs.progress", icon: "📈" },
  { id: "messages", tabKey: "dash.tabs.messages", icon: "💬" },
];

const StudentPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [enrolledClass, setEnrolledClass] = useState<EnrolledClass | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudentData = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }

      try {
        const { data: enrollment } = await supabase
          .from("student_classes")
          .select(`class_id, classes:class_id(name, grade)`)
          .eq("student_id", user.profileId)
          .limit(1)
          .single();

        if (enrollment) {
          const cls = enrollment.classes as any;
          setEnrolledClass({
            class_id: enrollment.class_id,
            class_name: cls?.name || "",
            class_grade: cls?.grade || "",
          });
        }

        const { data: gradeData } = await supabase
          .from("grades")
          .select(`id, score, max_score, exam_type, term, remarks, subject:subject_id(name)`)
          .eq("student_id", user.profileId)
          .order("created_at", { ascending: false });

        if (gradeData) {
          setGrades(gradeData.map((g: any) => ({
            id: g.id,
            subject_name: g.subject?.name || "",
            score: g.score,
            max_score: g.max_score,
            exam_type: g.exam_type || "",
            term: g.term || "",
            remarks: g.remarks || null,
          })));
        }

        // Attendance (for the Daily attendance panel)
        const { data: attData } = await supabase
          .from("attendance")
          .select("id, date, status")
          .eq("student_id", user.profileId)
          .order("date", { ascending: false });
        setAttendance((attData as Att[]) || []);

        // Count outstanding assignments across enrolled classes
        const { data: classes } = await supabase
          .from("student_classes")
          .select("class_id")
          .eq("student_id", user.profileId);
        const classIds = (classes || []).map((c: any) => c.class_id);
        if (classIds.length > 0) {
          const { data: content } = await supabase
            .from("content")
            .select("id")
            .in("class_id", classIds)
            .in("type", ["assignment", "classwork"])
            .eq("is_published", true);
          const contentIds = (content || []).map((c: any) => c.id);
          if (contentIds.length > 0) {
            const { data: subs } = await supabase
              .from("submissions")
              .select("content_id, status")
              .eq("student_id", user.profileId)
              .in("content_id", contentIds);
            const done = new Set((subs || []).filter((s: any) => s.status !== "pending").map((s: any) => s.content_id));
            setPendingCount(contentIds.filter((id: string) => !done.has(id)).length);
          } else {
            setPendingCount(0);
          }
        } else {
          setPendingCount(0);
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, [user?.profileId]);

  const avgScore = grades.length > 0
    ? (grades.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0) / grades.length).toFixed(1)
    : null;

  const attStats = useMemo(() => {
    const present = attendance.filter((a) => a.status === "present").length;
    const tardies = attendance.filter((a) => a.status === "late").length;
    const absences = attendance.filter((a) => a.status === "absent").length;
    const excused = attendance.filter((a) => a.status === "excused").length;
    const total = attendance.length;
    const rate = computeAttendanceRate({ present, late: tardies, absent: absences, excused });
    return { present, tardies, absences, excused, total, rate };
  }, [attendance]);

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">{t("dash.hi", { name: user?.firstName || "Student" })}</h1>
        <p className="text-green-100 text-sm">
          {enrolledClass
            ? `${enrolledClass.class_name} • ${t("dash.student.myClass")} ${enrolledClass.class_grade}`
            : t("dash.student.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
              tab === tb.id ? "bg-green-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>{tb.icon}</span>{t(tb.tabKey)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-5">
          {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryStat
              label={t("dash.student.myClass")}
              value={loading ? "—" : enrolledClass?.class_name || "None"}
              accent="indigo" icon="🏫" size="text-base"
              hint={enrolledClass?.class_grade ? `${t("dash.student.myClass")} ${enrolledClass.class_grade}` : undefined}
            />
            <SummaryStat
              label={t("dash.student.average")}
              value={loading ? "—" : avgScore ? `${avgScore}%` : "—"}
              accent="emerald" icon="🎯"
              valueClass={avgScore ? gradeColor(parseFloat(avgScore)) : "text-gray-400"}
            />
            <SummaryStat
              label={t("dash.student.toDo")}
              value={loading || pendingCount === null ? "—" : String(pendingCount)}
              accent={pendingCount && pendingCount > 0 ? "amber" : "slate"} icon="📝"
              valueClass={pendingCount && pendingCount > 0 ? "text-amber-600" : "text-gray-700"}
              hint={t("dash.student.assignments")}
            />
            <SummaryStat
              label={t("wdg.attendance")}
              value={loading || attStats.rate === null ? "—" : `${attStats.rate.toFixed(0)}%`}
              accent="sky" icon="📅"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* LEFT (2 cols) */}
            <div className="xl:col-span-2 flex flex-col gap-5">
              <Panel
                title={t("dash.student.recentGrades")} icon="🎓" accent="emerald"
                action={
                  <button onClick={() => setTab("grades")} className="text-xs text-green-600 font-medium hover:text-green-700">
                    {t("dash.student.viewAll")}
                  </button>
                }
              >
                {loading ? (
                  <EmptyHint text={t("common.loading")} />
                ) : grades.length === 0 ? (
                  <EmptyHint text={t("dash.student.noGrades")} />
                ) : (
                  <div className="divide-y divide-gray-100">
                    {grades.slice(0, 6).map((g) => {
                      const pct = (g.score / g.max_score) * 100;
                      return (
                        <div key={g.id} className="flex items-center gap-3 py-2.5">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shrink-0 ${gradeBg(pct)}`}>
                            {Math.round(pct)}%
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800 truncate">{g.subject_name}</p>
                            <p className="text-[11px] text-gray-400">{g.exam_type}{g.term ? ` • ${g.term}` : ""}</p>
                          </div>
                          <span className={`text-sm font-bold shrink-0 ${gradeColor(pct)}`}>{g.score}/{g.max_score}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title={t("dash.student.mySchedule")} icon="🗓️" accent="indigo">
                <BigCalendar />
              </Panel>
            </div>

            {/* RIGHT */}
            <div className="flex flex-col gap-5">
              <Panel title={t("dash.student.subjectProgress")} icon="📊" accent="purple">
                <ProgressTracker />
              </Panel>

              <Panel title={t("wdg.attendance")} icon="📅" accent="sky">
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
                    <div className="flex flex-wrap gap-1.5">
                      {attendance.slice(0, 10).map((a) => (
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
                )}
              </Panel>

              <Performance />
              <EventCalendar />
              <Announcements />
            </div>
          </div>
        </div>
      )}

      {tab === "assignments" && (
        <Panel title={t("dash.student.myAssignments")} icon="📝" accent="amber">
          <StudentAssignments />
        </Panel>
      )}

      {tab === "grades" && <GradesPortal accent="emerald" />}

      {tab === "progress" && (
        <Panel title={t("dash.student.myProgress")} icon="📊" accent="purple">
          <ProgressTracker />
        </Panel>
      )}

      {tab === "messages" && <Messaging />}
    </div>
  );
};

export default StudentPage;
