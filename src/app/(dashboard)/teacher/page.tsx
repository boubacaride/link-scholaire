"use client";

import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import Performance from "@/components/Performance";
import { useAuth } from "@/contexts/AuthContext";

const TeacherPage = () => {
  const { user } = useAuth();

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
            You have 5 classes scheduled today
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">My Classes</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">6</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Students</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">148</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">12</p>
            <p className="text-[10px] text-gray-400">to grade</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Submissions</p>
            <p className="text-2xl font-bold text-green-600 mt-1">87%</p>
            <p className="text-[10px] text-gray-400">this week</p>
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-2">My Schedule</h2>
          <BigCalendar />
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <button className="p-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
              + New Lesson
            </button>
            <button className="p-3 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">
              + Assignment
            </button>
            <button className="p-3 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors">
              Grade Work
            </button>
            <button className="p-3 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors">
              Attendance
            </button>
          </div>
        </div>

        {/* Performance */}
        <Performance />

        <Announcements />
      </div>
    </div>
  );
};

export default TeacherPage;
