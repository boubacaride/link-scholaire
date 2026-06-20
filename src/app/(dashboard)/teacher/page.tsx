"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import Performance from "@/components/Performance";
import Messaging from "@/components/Messaging";
import Gradebook from "@/components/dashboard/Gradebook";
import SubmissionsGrader from "@/components/dashboard/SubmissionsGrader";
import ClassRoster from "@/components/dashboard/ClassRoster";
import LessonPlanner from "@/components/dashboard/LessonPlanner";
import TeacherAnalytics from "@/components/dashboard/TeacherAnalytics";
import ReminderComposer from "@/components/dashboard/ReminderComposer";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface AssignedClass {
  class_id: string;
  class_name: string;
  class_grade: string;
  subject_name: string;
  subject_id: string;
}

interface StudentGrade {
  id: string;
  student_name: string;
  subject_name: string;
  class_name: string;
  score: number;
  max_score: number;
  exam_type: string;
}

type Tab = "overview" | "submissions" | "gradebook" | "roster" | "planner" | "analytics" | "messages";

const TABS: { id: Tab; tabKey: string; icon: string }[] = [
  { id: "overview", tabKey: "dash.tabs.overview", icon: "🏠" },
  { id: "submissions", tabKey: "dash.tabs.submissions", icon: "📥" },
  { id: "gradebook", tabKey: "dash.tabs.gradebook", icon: "📊" },
  { id: "roster", tabKey: "dash.tabs.roster", icon: "👥" },
  { id: "planner", tabKey: "dash.tabs.planner", icon: "📚" },
  { id: "analytics", tabKey: "dash.tabs.analytics", icon: "📈" },
  { id: "messages", tabKey: "dash.tabs.messages", icon: "💬" },
];

const TeacherPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);
  const [recentGrades, setRecentGrades] = useState<StudentGrade[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderToast, setReminderToast] = useState<string | null>(null);

  useEffect(() => {
    const fetchTeacherData = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }

      try {
        const { data: classSubjects } = await supabase
          .from("class_subjects")
          .select(`
            class_id,
            subject_id,
            classes:class_id(name, grade),
            subjects:subject_id(name)
          `)
          .eq("teacher_id", user.profileId);

        if (classSubjects) {
          const mapped: AssignedClass[] = classSubjects.map((cs: any) => ({
            class_id: cs.class_id,
            subject_id: cs.subject_id,
            class_name: cs.classes?.name || "",
            class_grade: cs.classes?.grade || "",
            subject_name: cs.subjects?.name || "",
          }));
          setAssignedClasses(mapped);

          const classIds = Array.from(new Set(mapped.map((c) => c.class_id)));
          if (classIds.length > 0) {
            const { count } = await supabase
              .from("student_classes")
              .select("id", { count: "exact", head: true })
              .in("class_id", classIds);
            setStudentCount(count || 0);
          }
        }

        const { data: grades } = await supabase
          .from("grades")
          .select(`
            id, score, max_score, exam_type,
            student:student_id(first_name, last_name),
            subject:subject_id(name),
            class:class_id(name)
          `)
          .eq("recorded_by", user.profileId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (grades) {
          setRecentGrades(grades.map((g: any) => ({
            id: g.id,
            student_name: `${g.student?.first_name || ""} ${g.student?.last_name || ""}`,
            subject_name: g.subject?.name || "",
            class_name: g.class?.name || "",
            score: g.score,
            max_score: g.max_score,
            exam_type: g.exam_type,
          })));
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    };

    fetchTeacherData();
  }, [user?.profileId]);

  const uniqueClasses = Array.from(new Map(assignedClasses.map((c) => [c.class_id, c])).values());
  const uniqueSubjects = Array.from(new Set(assignedClasses.map((c) => c.subject_name)));

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">{t("dash.goodDay", { name: user?.firstName || "Teacher" })}</h1>
        <p className="text-blue-100 text-sm">
          {loading ? t("dash.loading") : t("dash.teacher.summary")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
              tab === tb.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>{tb.icon}</span>{t(tb.tabKey)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex gap-4 flex-col xl:flex-row">
          {/* LEFT */}
          <div className="w-full xl:w-2/3 flex flex-col gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{t("dash.teacher.myClasses")}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{loading ? "—" : uniqueClasses.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{t("dash.teacher.students")}</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{loading ? "—" : studentCount}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{t("dash.teacher.subjects")}</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">{loading ? "—" : uniqueSubjects.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{t("dash.teacher.gradesGiven")}</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{loading ? "—" : recentGrades.length}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h2 className="text-lg font-semibold">{t("dash.teacher.classesSubjects")}</h2>
              </div>
              {loading ? (
                <div className="p-6 text-center text-gray-400 text-sm">{t("common.loading")}</div>
              ) : assignedClasses.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500 text-sm">{t("dash.teacher.noClasses")}</p>
                  <p className="text-gray-400 text-xs mt-1">{t("dash.teacher.noClassesHint")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {assignedClasses.map((ac, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                          {ac.class_name.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{ac.class_name}</p>
                          <p className="text-xs text-gray-400">Grade {ac.class_grade}</p>
                        </div>
                      </div>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-medium">
                        {ac.subject_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {recentGrades.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                  <h2 className="text-lg font-semibold">{t("dash.teacher.recentGrades")}</h2>
                </div>
                <div className="divide-y">
                  {recentGrades.map((g) => (
                    <div key={g.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{g.student_name}</p>
                        <p className="text-xs text-gray-400">{g.subject_name} • {g.class_name} • {g.exam_type}</p>
                      </div>
                      <span className={`text-sm font-bold ${(g.score / g.max_score) >= 0.7 ? "text-green-600" : (g.score / g.max_score) >= 0.5 ? "text-orange-600" : "text-red-600"}`}>
                        {g.score}/{g.max_score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <h2 className="text-lg font-semibold mb-2">{t("dash.teacher.mySchedule")}</h2>
              <BigCalendar />
            </div>
          </div>

          {/* RIGHT */}
          <div className="w-full xl:w-1/3 flex flex-col gap-6">
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <h2 className="text-lg font-semibold mb-3">{t("dash.teacher.quickActions")}</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setTab("planner")} className="p-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">{t("dash.teacher.newLesson")}</button>
                <button onClick={() => setTab("planner")} className="p-3 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">{t("dash.teacher.newAssignment")}</button>
                <button onClick={() => setTab("submissions")} className="p-3 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors">{t("dash.teacher.gradeWork")}</button>
                <button onClick={() => setReminderOpen(true)} className="p-3 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors">🔔 Send Reminder</button>
              </div>
            </div>
            <Performance />
            <Announcements />
          </div>
        </div>
      )}

      {tab === "submissions" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">{t("dash.teacher.submissionsTitle")}</h2>
          <SubmissionsGrader />
        </div>
      )}

      {tab === "gradebook" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">{t("dash.teacher.gradesDashboard")}</h2>
          <Gradebook />
        </div>
      )}

      {tab === "roster" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">{t("dash.teacher.classRoster")}</h2>
          <ClassRoster />
        </div>
      )}

      {tab === "planner" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">{t("dash.teacher.lessonPlanning")}</h2>
          <LessonPlanner />
        </div>
      )}

      {tab === "analytics" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">{t("dash.teacher.analytics")}</h2>
          <TeacherAnalytics />
        </div>
      )}

      {tab === "messages" && <Messaging />}

      {reminderOpen && (
        <ReminderComposer
          onClose={() => setReminderOpen(false)}
          onSent={(n) => setReminderToast(`Reminder sent to ${n} recipient${n === 1 ? "" : "s"}.`)}
        />
      )}

      {reminderToast && (
        <div
          className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg cursor-pointer"
          onClick={() => setReminderToast(null)}
        >
          ✓ {reminderToast}
        </div>
      )}
    </div>
  );
};

export default TeacherPage;
