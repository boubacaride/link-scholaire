"use client";

import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import { useAuth } from "@/contexts/AuthContext";

const ParentPage = () => {
  const { user } = useAuth();

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
            <p className="text-2xl font-bold text-gray-800 mt-1">2</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Avg Grade</p>
            <p className="text-2xl font-bold text-green-600 mt-1">B+</p>
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">3</p>
            <p className="text-[10px] text-gray-400">assignments</p>
          </div>
          {user?.schoolType === "private" && (
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Fees Due</p>
              <p className="text-2xl font-bold text-red-600 mt-1">$500</p>
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
        </div>
        <Announcements />
      </div>
    </div>
  );
};

export default ParentPage;
