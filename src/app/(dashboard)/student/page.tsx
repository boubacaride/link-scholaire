"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import Performance from "@/components/Performance";
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
}

const StudentPage = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const [enrolledClass, setEnrolledClass] = useState<EnrolledClass | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudentData = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }

      try {
        // Fetch enrolled class
        const { data: enrollment } = await supabase
          .from("student_classes")
          .select(`
            class_id,
            classes:class_id(name, grade)
          `)
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

        // Fetch grades
        const { data: gradeData } = await supabase
          .from("grades")
          .select(`
            id, score, max_score, exam_type, term,
            subject:subject_id(name)
          `)
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
          })));
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, [user?.profileId]);

  // Calculate GPA (simple average percentage)
  const avgScore = grades.length > 0
    ? (grades.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0) / grades.length).toFixed(1)
    : null;

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3 flex flex-col gap-6">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">
            Hi, {user?.firstName || "Student"}!
          </h1>
          <p className="text-green-100 text-sm">
            {enrolledClass
              ? `${enrolledClass.class_name} • Grade ${enrolledClass.class_grade}`
              : "Keep up the great work — you're doing amazing this semester"}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">My Class</p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {loading ? "—" : enrolledClass?.class_name || "None"}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Average</p>
            <p className={`text-2xl font-bold mt-1 ${avgScore && parseFloat(avgScore) >= 70 ? "text-green-600" : avgScore ? "text-orange-600" : "text-gray-400"}`}>
              {loading ? "—" : avgScore ? `${avgScore}%` : "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Grades</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {loading ? "—" : grades.length}
            </p>
            <p className="text-[10px] text-gray-400">recorded</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Grade Level</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {loading ? "—" : enrolledClass?.class_grade || "—"}
            </p>
          </div>
        </div>

        {/* My Grades */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">My Grades</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : grades.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 text-sm">No grades recorded yet.</p>
              <p className="text-gray-400 text-xs mt-1">Your grades will appear here once teachers record them.</p>
            </div>
          ) : (
            <div className="divide-y">
              {grades.map((g) => {
                const pct = (g.score / g.max_score) * 100;
                return (
                  <div key={g.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs ${
                        pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 50 ? "bg-orange-500" : "bg-red-500"
                      }`}>
                        {Math.round(pct)}%
                      </div>
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

        {/* Schedule */}
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-2">My Schedule</h2>
          <BigCalendar />
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-6">
        <Performance />
        <EventCalendar />
        <Announcements />
      </div>
    </div>
  );
};

export default StudentPage;
