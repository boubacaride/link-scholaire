"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import Performance from "@/components/Performance";
import Messaging from "@/components/Messaging";
import StudentAssignments from "@/components/dashboard/StudentAssignments";
import ProgressTracker from "@/components/dashboard/ProgressTracker";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface EnrolledClass {
  class_id: string;
  class_name: string;
  class_grade: string;
}

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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "assignments", label: "Assignments", icon: "📝" },
  { id: "grades", label: "Grades", icon: "🎯" },
  { id: "progress", label: "Progress", icon: "📈" },
  { id: "messages", label: "Messages", icon: "💬" },
];

const StudentPage = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [enrolledClass, setEnrolledClass] = useState<EnrolledClass | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
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

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">Hi, {user?.firstName || "Student"}!</h1>
        <p className="text-green-100 text-sm">
          {enrolledClass
            ? `${enrolledClass.class_name} • Grade ${enrolledClass.class_grade}`
            : "Keep up the great work — you're doing amazing this semester"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
              tab === t.id ? "bg-green-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="flex gap-4 flex-col xl:flex-row">
          <div className="w-full xl:w-2/3 flex flex-col gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">My Class</p>
                <p className="text-lg font-bold text-gray-800 mt-1">{loading ? "—" : enrolledClass?.class_name || "None"}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Average</p>
                <p className={`text-2xl font-bold mt-1 ${avgScore && parseFloat(avgScore) >= 70 ? "text-green-600" : avgScore ? "text-orange-600" : "text-gray-400"}`}>
                  {loading ? "—" : avgScore ? `${avgScore}%` : "—"}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">To Do</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{loading || pendingCount === null ? "—" : pendingCount}</p>
                <p className="text-[10px] text-gray-400">assignments</p>
              </div>
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Grades</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{loading ? "—" : grades.length}</p>
                <p className="text-[10px] text-gray-400">recorded</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Grades</h2>
                <button onClick={() => setTab("grades")} className="text-xs text-green-600 font-medium">View all</button>
              </div>
              {loading ? (
                <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
              ) : grades.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500 text-sm">No grades recorded yet.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {grades.slice(0, 5).map((g) => {
                    const pct = (g.score / g.max_score) * 100;
                    return (
                      <div key={g.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs ${
                            pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 50 ? "bg-orange-500" : "bg-red-500"
                          }`}>{Math.round(pct)}%</div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{g.subject_name}</p>
                            <p className="text-xs text-gray-400">{g.exam_type}{g.term ? ` • ${g.term}` : ""}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{g.score}/{g.max_score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <h2 className="text-lg font-semibold mb-2">My Schedule</h2>
              <BigCalendar />
            </div>
          </div>

          <div className="w-full xl:w-1/3 flex flex-col gap-6">
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Subject Progress</h2>
              <ProgressTracker />
            </div>
            <Performance />
            <EventCalendar />
            <Announcements />
          </div>
        </div>
      )}

      {tab === "assignments" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">My Assignments</h2>
          <StudentAssignments />
        </div>
      )}

      {tab === "grades" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">Grades &amp; Feedback</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : grades.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 text-sm">No grades recorded yet.</p>
              <p className="text-gray-400 text-xs mt-1">Your grades and teacher feedback will appear here.</p>
            </div>
          ) : (
            <div className="divide-y">
              {grades.map((g) => {
                const pct = (g.score / g.max_score) * 100;
                return (
                  <div key={g.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs ${
                          pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 50 ? "bg-orange-500" : "bg-red-500"
                        }`}>{Math.round(pct)}%</div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{g.subject_name}</p>
                          <p className="text-xs text-gray-400">{g.exam_type}{g.term ? ` • ${g.term}` : ""}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{g.score}/{g.max_score}</span>
                    </div>
                    {g.remarks && (
                      <div className="mt-2 ml-[52px] bg-purple-50 border border-purple-100 rounded-lg p-2.5">
                        <p className="text-[10px] text-purple-500 uppercase tracking-wide font-medium">Feedback</p>
                        <p className="text-xs text-purple-800 mt-0.5">{g.remarks}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "progress" && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-4">My Progress</h2>
          <ProgressTracker />
        </div>
      )}

      {tab === "messages" && <Messaging />}
    </div>
  );
};

export default StudentPage;
