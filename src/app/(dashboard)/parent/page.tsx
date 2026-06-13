"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import Messaging from "@/components/Messaging";
import ChildMonitor from "@/components/dashboard/ChildMonitor";
import GradesPortal from "@/components/dashboard/GradesPortal";
import StudentRecordTab, { type StudentRecordTabId } from "@/components/dashboard/StudentRecordTab";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface LinkedStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  avatar_url: string | null;
}

type Tab = "overview" | "grades" | "messages" | StudentRecordTabId;

const TABS: { id: Tab; tabKey: string; icon: string }[] = [
  { id: "overview", tabKey: "dash.tabs.overview", icon: "🏠" },
  { id: "student-information", tabKey: "dash.tabs.studentInformation", icon: "👤" },
  { id: "grades", tabKey: "dash.tabs.grades", icon: "📊" },
  { id: "planner", tabKey: "dash.tabs.planner", icon: "📋" },
  { id: "schedule", tabKey: "dash.tabs.schedule", icon: "🗓️" },
  { id: "attendance", tabKey: "dash.tabs.attendance", icon: "✅" },
  { id: "activities", tabKey: "dash.tabs.activities", icon: "⭐" },
  { id: "resources", tabKey: "dash.tabs.resources", icon: "📄" },
  { id: "report-card", tabKey: "dash.tabs.reportCard", icon: "🔖" },
  { id: "assessment-scores", tabKey: "dash.tabs.assessmentScores", icon: "📖" },
  { id: "school-information", tabKey: "dash.tabs.schoolInformation", icon: "🏫" },
  { id: "news", tabKey: "dash.tabs.news", icon: "📰" },
  { id: "calendar", tabKey: "dash.tabs.calendar", icon: "📅" },
  { id: "class-information", tabKey: "dash.tabs.classInformation", icon: "🎓" },
  { id: "family-information", tabKey: "dash.tabs.familyInformation", icon: "👨‍👩‍👧" },
  { id: "alerts", tabKey: "dash.tabs.alerts", icon: "🔔" },
  { id: "messages", tabKey: "dash.tabs.messages", icon: "💬" },
];

const ParentPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [children, setChildren] = useState<LinkedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const supabase = createClient();

  useEffect(() => {
    const fetchChildren = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }

      try {
        const { data: links } = await supabase
          .from("parent_students")
          .select("student_id")
          .eq("parent_id", user.profileId);

        if (!links || links.length === 0) {
          setChildren([]);
          setLoading(false);
          return;
        }

        const studentIds = links.map((l: { student_id: string }) => l.student_id);
        const { data: studentProfiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url")
          .in("id", studentIds);

        if (studentProfiles) {
          setChildren(studentProfiles);
          if (studentProfiles.length > 0) setSelectedChild(studentProfiles[0].id);
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
    <div className="p-4 flex flex-col gap-4">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">{t("dash.hello", { name: user?.firstName || "Parent" })}</h1>
        <p className="text-orange-100 text-sm">{t("dash.parent.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
              tab === tb.id ? "bg-orange-500 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>{tb.icon}</span>{t(tb.tabKey)}
          </button>
        ))}
      </div>

      {tab === "messages" && <Messaging />}

      {tab !== "messages" && (
        <div className="flex gap-4 flex-col xl:flex-row">
          {/* LEFT */}
          <div className={`w-full flex flex-col gap-6 ${tab === "overview" ? "xl:w-2/3" : ""}`}>
            {loading ? (
              <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 text-sm">{t("common.loading")}</div>
            ) : children.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
                <div className="text-4xl mb-3">👨‍👧‍👦</div>
                <p className="text-gray-500 text-sm">{t("dash.parent.noChildren")}</p>
                <p className="text-gray-400 text-xs mt-1">
                  {t("dash.parent.noChildrenHint")}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {/* Child tabs */}
                <div className="flex border-b overflow-x-auto">
                  {children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedChild(child.id)}
                      className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedChild === child.id
                          ? "text-orange-600 border-b-2 border-orange-500 bg-orange-50/50"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {child.first_name} {child.last_name}
                    </button>
                  ))}
                </div>

                {selectedStudent && (
                  <div className="p-4">
                    <div className="flex items-center gap-4 mb-5 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
                        {selectedStudent.first_name[0]}{selectedStudent.last_name[0]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg text-gray-800 truncate">
                          {selectedStudent.first_name} {selectedStudent.last_name}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Student</span>
                          {selectedStudent.email && <p className="text-xs text-gray-400 truncate">{selectedStudent.email}</p>}
                        </div>
                      </div>
                    </div>
                    {tab === "overview" ? (
                      <ChildMonitor
                        studentId={selectedStudent.id}
                        studentName={selectedStudent.first_name}
                      />
                    ) : tab === "grades" ? (
                      <GradesPortal studentId={selectedStudent.id} accent="amber" />
                    ) : (
                      <StudentRecordTab
                        tab={tab as StudentRecordTabId}
                        studentId={selectedStudent.id}
                        readOnly
                        accent="amber"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT (overview only) */}
          {tab === "overview" && (
            <div className="w-full xl:w-1/3 flex flex-col gap-6">
              <div className="bg-white rounded-xl p-4 border shadow-sm">
                <h2 className="text-lg font-semibold mb-3">{t("dash.parent.contactTeachers")}</h2>
                <p className="text-sm text-gray-500 mb-3">
                  {t("dash.parent.contactHint")}
                </p>
                <button
                  onClick={() => setTab("messages")}
                  className="w-full bg-orange-500 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-orange-600 transition-colors"
                >
                  {t("dash.parent.openMessages")}
                </button>
              </div>
              <Announcements />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParentPage;
