"use client";

import { useEffect, useState } from "react";
import Messaging from "@/components/Messaging";
import PageHeader from "@/components/PageHeader";
import ChildPortal from "@/components/dashboard/ChildPortal";
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

type Tab = "home" | "messages";

const ParentPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [children, setChildren] = useState<LinkedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");

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

  // Short, stable display ID derived from the student's profile UUID — we
  // don't have a separate numeric student_id column, so use the last six hex
  // chars uppercased (e.g. "A2B3C4") which still identifies the record.
  const studentShortId = (id?: string) =>
    id ? id.replace(/-/g, "").slice(-6).toUpperCase() : "";

  const pageTitle = tab === "messages" ? t("dashx.messages") : t("dashx.home");

  return (
    <div className="flex flex-col">
      {/* Gray content-header: page title on the left, selected student on the right */}
      <PageHeader
        title={pageTitle}
        right={selectedStudent && (
          <>
            <h4 className="text-sm font-bold text-gray-700 leading-tight truncate">
              {selectedStudent.first_name.toUpperCase()} {selectedStudent.last_name.toUpperCase()}
            </h4>
            <p className="text-[11px] text-gray-500 leading-tight">
              {t("dashx.studentId", { id: studentShortId(selectedStudent.id) })}
            </p>
          </>
        )}
      />

      <div className="p-4 flex flex-col gap-4">
        {/* Tabs */}
        <div className="relative z-10 shrink-0 flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
          {([
            { id: "home", tabKey: "dash.tabs.overview", icon: "🏠" },
            { id: "messages", tabKey: "dash.tabs.messages", icon: "💬" },
          ] as { id: Tab; tabKey: string; icon: string }[]).map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
                tab === tb.id
                  ? "bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span>{tb.icon}</span>{t(tb.tabKey)}
            </button>
          ))}
        </div>

      {tab === "messages" && <Messaging />}

      {tab === "home" && (
        <div className="flex flex-col gap-4 pb-28">
          {loading ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 text-sm">{t("common.loading")}</div>
          ) : children.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
              <div className="text-4xl mb-3">👨‍👧‍👦</div>
              <p className="text-gray-500 text-sm">{t("dash.parent.noChildren")}</p>
              <p className="text-gray-400 text-xs mt-1">{t("dash.parent.noChildrenHint")}</p>
            </div>
          ) : selectedStudent ? (
            <ChildPortal
              key={selectedStudent.id}
              studentId={selectedStudent.id}
              studentName={selectedStudent.first_name}
            />
          ) : (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-400 text-sm">
              {t("dashx.selectChild")}
            </div>
          )}

        </div>
      )}
      </div>

      {/* ── Children footer (full-width dark bar fixed at the bottom) ─── */}
      {children.length > 0 && (
        <ChildrenFooter
          children={children}
          selectedChild={selectedChild}
          onSelect={setSelectedChild}
        />
      )}
    </div>
  );
};

/* Dark "shelf" footer with one avatar + name per child, sitting flush at
 * the bottom of the viewport across the full width below the sidebar. */
const ChildrenFooter = ({
  children,
  selectedChild,
  onSelect,
}: {
  children: LinkedStudent[];
  selectedChild: string | null;
  onSelect: (id: string) => void;
}) => (
  <div className="fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-b from-[#3a3a3a] via-[#1f1f1f] to-[#0a0a0a] border-t border-black shadow-[0_-2px_10px_rgba(0,0,0,0.4)]">
    <div className="flex items-end justify-between gap-4 pl-[calc(14%+1rem)] md:pl-[calc(8%+1rem)] lg:pl-[calc(16%+1rem)] xl:pl-[calc(14%+1rem)] pr-4 pt-2 pb-1.5">
      <div className="flex items-end gap-3">
        {children.map((child) => {
          const active = child.id === selectedChild;
          return (
            <button
              key={child.id}
              onClick={() => onSelect(child.id)}
              title={`${child.first_name} ${child.last_name}`}
              className="group flex flex-col items-center gap-1 transition-transform hover:-translate-y-0.5"
            >
              <ChildAvatar student={child} size={42} ring={active} />
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap max-w-[100px] truncate ${
                  active ? "text-white" : "text-white/55 group-hover:text-white/85"
                }`}
              >
                {child.first_name} {child.last_name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/40 hidden sm:block pb-1">
        © {new Date().getFullYear()} Link Scholaire
      </p>
    </div>
  </div>
);

/* Avatar with image fallback to initials. */
const ChildAvatar = ({
  student, size, ring,
}: { student: LinkedStudent; size: number; ring?: boolean }) => {
  const initials = `${student.first_name[0] || ""}${student.last_name[0] || ""}`.toUpperCase();
  return student.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={student.avatar_url}
      alt={`${student.first_name} ${student.last_name}`}
      className={`rounded-md object-cover ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className={`rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shadow-sm ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  );
};

export default ParentPage;
