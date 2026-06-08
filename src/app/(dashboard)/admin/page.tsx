"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Announcements from "@/components/Announcements";
import AttendanceChart from "@/components/AttendanceChart";
import CountChart from "@/components/CountChart";
import EventCalendar from "@/components/EventCalendar";
import FinanceChart from "@/components/FinanceChart";
import UserCard from "@/components/UserCard";
import PlatformDashboard from "@/components/dashboard/PlatformDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { roleHome } from "@/lib/roleHome";

const AdminPage = () => {
  const { user, loading } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();

  // This dashboard is the SCHOOL ADMINISTRATION landing page only. Teachers,
  // students and parents who reach it (e.g. via a stale link) are sent home.
  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";
  useEffect(() => {
    if (!loading && user && !isAdmin) {
      router.replace(roleHome(user.role));
    }
  }, [loading, user, isAdmin, router]);

  if (!loading && user && !isAdmin) return null;

  // Platform admins manage tenants only — never a school's internal data.
  if (user?.role === "platform_admin") {
    return <PlatformDashboard />;
  }

  return (
    <div className="p-4 flex gap-4 flex-col md:flex-row">
      {/* LEFT */}
      <div className="w-full lg:w-2/3 flex flex-col gap-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">
            {t("dash.welcomeBack", { name: user?.firstName || "Admin" })}
          </h1>
          <p className="text-blue-100 text-sm">
            {user?.schoolName || "SchoolFlow"} &middot; {new Date().toLocaleDateString(locale === "ar" ? "ar" : locale === "fr" ? "fr-FR" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* USER CARDS */}
        <div className="flex gap-4 justify-between flex-wrap">
          <UserCard type="student" />
          <UserCard type="teacher" />
          <UserCard type="parent" />
          <UserCard type="staff" />
        </div>
        {/* MIDDLE CHARTS */}
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* COUNT CHART */}
          <div className="w-full lg:w-1/3 h-[450px]">
            <CountChart />
          </div>
          {/* ATTENDANCE CHART */}
          <div className="w-full lg:w-2/3 h-[450px]">
            <AttendanceChart />
          </div>
        </div>
        {/* BOTTOM CHART */}
        <div className="w-full h-[500px]">
          <FinanceChart />
        </div>
      </div>
      {/* RIGHT */}
      <div className="w-full lg:w-1/3 flex flex-col gap-8">
        <EventCalendar />
        <Announcements />
      </div>
    </div>
  );
};

export default AdminPage;
