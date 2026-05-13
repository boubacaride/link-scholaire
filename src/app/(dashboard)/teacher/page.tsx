"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import Performance from "@/components/Performance";
import { useAuth } from "@/contexts/AuthContext";
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

const TeacherPage = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);
  const [recentGrades, setRecentGrades] = useState<StudentGrade[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeacherData = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }

      try {
        // Fetch assigned classes & subjects
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

          // Count unique students across all assigned classes
          const classIds = Array.from(new Set(mapped.map((c) => c.class_id)));
          if (classIds.length > 0) {
            const { count } = await supabase
              .from("student_classes")
              .select("id", { count: "exact", head: true })
              .in("class_id", classIds);
            setStudentCount(count || 0);
          }
        }

        // Fetch recent grades recorded by this teacher
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

  // Deduplicate classes and subjects for display
  const uniqueClasses = Array.from(new Map(assignedClasses.map((c) => [c.class_id, c])).values());
  const uniqueSubjects = Array.from(new Set(assignedClasses.map((c) => c.subject_name)));

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3 flex flex-col gap-6">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">
            Good day, {user?.firstName || "Teacher"}
          </h1>
          <p className="text-blue-100 text-sm">
            {loading ? "Loading your data..." : `You teach ${uniqueSubjects.length} subject${uniqueSubjects.length !== 1 ? "s" : ""} across ${uniqueClasses.length} class${uniqueClasses.length !== 1 ? "es" : ""}`}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">My Classes</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{loading ? "—" : uniqueClasses.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Students</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{loading ? "—" : studentCount}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Subjects</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{loading ? "—" : uniqueSubjects.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Grades Given</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{loading ? "—" : recentGrades.length}</p>
          </div>
        </div>

        {/* My Classes & Subjects */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">My Classes &amp; Subjects</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
          ) : assignedClasses.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 text-sm">No classes assigned yet.</p>
              <p className="text-gray-400 text-xs mt-1">Contact the school admin to assign you to classes.</p>
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

        {/* Recent Grades */}
        {recentGrades.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold">Recent Grades</h2>
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

        {/* Schedule */}
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-2">My Schedule</h2>
          <BigCalendar />
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-6">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <button className="p-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">+ New Lesson</button>
            <button className="p-3 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">+ Assignment</button>
            <button className="p-3 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors">Grade Work</button>
            <button className="p-3 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors">Attendance</button>
          </div>
        </div>
        <Performance />
        <Announcements />
      </div>
    </div>
  );
};

export default TeacherPage;
