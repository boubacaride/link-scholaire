"use client";

import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import Performance from "@/components/Performance";
import { useAuth } from "@/contexts/AuthContext";

const StudentPage = () => {
  const { user } = useAuth();

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
            Keep up the great work — you&apos;re doing amazing this semester
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">My Classes</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">8</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">GPA</p>
            <p className="text-2xl font-bold text-green-600 mt-1">3.7</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Due Soon</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">4</p>
            <p className="text-[10px] text-gray-400">assignments</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Completed</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">92%</p>
            <p className="text-[10px] text-gray-400">lessons</p>
          </div>
        </div>

        {/* Upcoming Assignments */}
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Upcoming Assignments</h2>
          <div className="space-y-2">
            {[
              { subject: "Mathematics", title: "Chapter 5 Problem Set", due: "Tomorrow", color: "border-l-blue-500" },
              { subject: "English", title: "Essay: The Great Gatsby", due: "In 3 days", color: "border-l-green-500" },
              { subject: "Science", title: "Lab Report: Photosynthesis", due: "In 5 days", color: "border-l-purple-500" },
              { subject: "History", title: "Research Paper Draft", due: "Next week", color: "border-l-orange-500" },
            ].map((a, i) => (
              <div key={i} className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg border-l-4 ${a.color}`}>
                <div>
                  <p className="text-sm font-medium text-gray-800">{a.title}</p>
                  <p className="text-xs text-gray-500">{a.subject}</p>
                </div>
                <span className="text-xs text-gray-400">{a.due}</span>
              </div>
            ))}
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
        <Performance />
        <EventCalendar />
        <Announcements />
      </div>
    </div>
  );
};

export default StudentPage;
