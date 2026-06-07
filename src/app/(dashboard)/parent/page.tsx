"use client";

import { useEffect, useState } from "react";
import Announcements from "@/components/Announcements";
import Messaging from "@/components/Messaging";
import ChildMonitor from "@/components/dashboard/ChildMonitor";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface LinkedStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  avatar_url: string | null;
}

type Tab = "overview" | "messages";

const ParentPage = () => {
  const { user } = useAuth();
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
        <h1 className="text-2xl font-bold mb-1">Hello, {user?.firstName || "Parent"}</h1>
        <p className="text-orange-100 text-sm">Stay informed about your children&apos;s progress at school</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
        {([
          { id: "overview", label: "Overview", icon: "🏠" },
          { id: "messages", label: "Messages", icon: "💬" },
        ] as { id: Tab; label: string; icon: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
              tab === t.id ? "bg-orange-500 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === "messages" && <Messaging />}

      {tab === "overview" && (
        <div className="flex gap-4 flex-col xl:flex-row">
          {/* LEFT */}
          <div className="w-full xl:w-2/3 flex flex-col gap-6">
            {loading ? (
              <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : children.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
                <div className="text-4xl mb-3">👨‍👧‍👦</div>
                <p className="text-gray-500 text-sm">No students linked to your account.</p>
                <p className="text-gray-400 text-xs mt-1">
                  Please ask the school administrator to link your children to your account.
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
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-xl font-bold">
                        {selectedStudent.first_name[0]}{selectedStudent.last_name[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-gray-800">
                          {selectedStudent.first_name} {selectedStudent.last_name}
                        </h3>
                        {selectedStudent.email && <p className="text-xs text-gray-400">{selectedStudent.email}</p>}
                      </div>
                    </div>
                    <ChildMonitor
                      studentId={selectedStudent.id}
                      studentName={selectedStudent.first_name}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div className="w-full xl:w-1/3 flex flex-col gap-6">
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <h2 className="text-lg font-semibold mb-3">Contact Teachers</h2>
              <p className="text-sm text-gray-500 mb-3">
                Have a question? Message your child&apos;s teachers directly.
              </p>
              <button
                onClick={() => setTab("messages")}
                className="w-full bg-orange-500 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-orange-600 transition-colors"
              >
                Open Messages
              </button>
            </div>
            <Announcements />
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentPage;
