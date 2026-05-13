"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface LinkedStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  avatar_url: string | null;
  class_name?: string;
}

const ParentPage = () => {
  const { user } = useAuth();
  const [children, setChildren] = useState<LinkedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch linked students for this parent
  useEffect(() => {
    const fetchChildren = async () => {
      if (!supabase || !user?.profileId) {
        setLoading(false);
        return;
      }

      try {
        // Get student IDs linked to this parent
        const { data: links, error: linkError } = await supabase
          .from("parent_students")
          .select("student_id")
          .eq("parent_id", user.profileId);

        if (linkError || !links || links.length === 0) {
          setChildren([]);
          setLoading(false);
          return;
        }

        const studentIds = links.map((l: { student_id: string }) => l.student_id);

        // Fetch student profiles
        const { data: studentProfiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url")
          .in("id", studentIds);

        if (profileError || !studentProfiles) {
          setChildren([]);
          setLoading(false);
          return;
        }

        setChildren(studentProfiles);
        if (studentProfiles.length > 0) {
          setSelectedChild(studentProfiles[0].id);
        }
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, [user?.profileId]);

  const selectedStudent = children.find((c) => c.id === selectedChild);

  return (
    <div className="p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3 flex flex-col gap-6">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">
            Hello, {user?.firstName || "Parent"}
          </h1>
          <p className="text-orange-100 text-sm">
            Monitor your children&apos;s academic progress
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Children</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">
              {loading ? "—" : children.length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Avg Grade</p>
            <p className="text-2xl font-bold text-green-600 mt-1">—</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">—</p>
            <p className="text-[10px] text-gray-400">assignments</p>
          </div>
          {user?.schoolType === "private" && (
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Fees Due</p>
              <p className="text-2xl font-bold text-red-600 mt-1">—</p>
            </div>
          )}
        </div>

        {/* ── My Children Section ── */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">My Children</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {children.length === 0 && !loading
                ? "No children linked to your account yet. Contact the school admin."
                : `${children.length} student${children.length !== 1 ? "s" : ""} linked`}
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : children.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-3">👨‍👧‍👦</div>
              <p className="text-gray-500 text-sm">No students linked to your account.</p>
              <p className="text-gray-400 text-xs mt-1">
                Please ask the school administrator to link your children to your account.
              </p>
            </div>
          ) : (
            <div>
              {/* Child tabs */}
              <div className="flex border-b overflow-x-auto">
                {children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChild(child.id)}
                    className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedChild === child.id
                        ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {child.first_name} {child.last_name}
                  </button>
                ))}
              </div>

              {/* Selected child details */}
              {selectedStudent && (
                <div className="p-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                      {selectedStudent.first_name[0]}{selectedStudent.last_name[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-800">
                        {selectedStudent.first_name} {selectedStudent.last_name}
                      </h3>
                      {selectedStudent.email && (
                        <p className="text-xs text-gray-400">{selectedStudent.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Student info cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-[10px] text-blue-500 uppercase tracking-wide font-medium">Status</p>
                      <p className="text-sm font-semibold text-blue-800 mt-1">Active</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-[10px] text-green-500 uppercase tracking-wide font-medium">Attendance</p>
                      <p className="text-sm font-semibold text-green-800 mt-1">—</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-[10px] text-purple-500 uppercase tracking-wide font-medium">Grade</p>
                      <p className="text-sm font-semibold text-purple-800 mt-1">—</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Student Schedule</h2>
          <BigCalendar />
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-6">
        {/* Notifications */}
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Notifications</h2>
          {children.length === 0 && !loading ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Notifications will appear once students are linked.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-sm font-medium text-red-700">Missing Homework</p>
                <p className="text-xs text-red-500 mt-0.5">Math Assignment due yesterday</p>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-sm font-medium text-blue-700">New Grade Posted</p>
                <p className="text-xs text-blue-500 mt-0.5">Science — Midterm Exam: 85/100</p>
              </div>
              <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
                <p className="text-sm font-medium text-green-700">Assignment Submitted</p>
                <p className="text-xs text-green-500 mt-0.5">English Essay submitted on time</p>
              </div>
            </div>
          )}
        </div>
        <Announcements />
      </div>
    </div>
  );
};

export default ParentPage;
