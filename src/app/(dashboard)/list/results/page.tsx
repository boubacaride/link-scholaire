"use client";

import { useEffect, useState } from "react";
import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import GradesPortal from "@/components/dashboard/GradesPortal";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

type GradeRow = {
  id: string;
  exam_type: string;
  score: number;
  max_score: number;
  term: string;
  created_at: string;
  student: { first_name: string; last_name: string } | null;
  subject: { name: string } | null;
  class: { name: string } | null;
  recorded_by_profile: { first_name: string; last_name: string } | null;
};

interface LinkedStudent {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

const ResultListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  if (role === "student") return <StudentGradesView />;
  if (role === "parent") return <ParentGradesView />;
  return <AdminGradesTable />;
};

/* ── Student: their own grades, ProgressBook-style ─────────────────── */
const StudentGradesView = () => (
  <div className="p-4">
    <GradesPortal />
  </div>
);

/* ── Parent: tab strip of children, then GradesPortal for the picked one ── */
const ParentGradesView = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const [children, setChildren] = useState<LinkedStudent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }
      const { data: links } = await supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", user.profileId);
      const ids = (links || []).map((l: { student_id: string }) => l.student_id);
      if (ids.length === 0) { setChildren([]); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url")
        .in("id", ids);
      const list = (profiles as LinkedStudent[]) || [];
      setChildren(list);
      if (list.length > 0) setSelected(list[0].id);
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  if (loading) {
    return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  }
  if (children.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-md border shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">👨‍👧‍👦</div>
          <p className="text-gray-500 text-sm">No linked children on your account yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {children.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-md border shadow-sm">
          {children.map((c) => {
            const active = c.id === selected;
            const initials = `${c.first_name[0] || ""}${c.last_name[0] || ""}`.toUpperCase();
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active ? "bg-[#1f3a5f] text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatar_url} alt="" className="w-6 h-6 rounded-md object-cover" />
                ) : (
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    active ? "bg-white/15 text-white" : "bg-blue-100 text-blue-700"
                  }`}>
                    {initials}
                  </span>
                )}
                {c.first_name} {c.last_name}
              </button>
            );
          })}
        </div>
      )}

      {selected && <GradesPortal key={selected} studentId={selected} />}
    </div>
  );
};

/* ── Admin / teacher: the existing CRUD list, untouched ───────────── */
const AdminGradesTable = () => {
  const { t } = useI18n();
  const columns = [
    { header: t("col.subject"), accessor: "subject" },
    { header: t("col.student"), accessor: "student" },
    { header: t("col.score"), accessor: "score", className: "hidden md:table-cell" },
    { header: t("col.type"), accessor: "type", className: "hidden md:table-cell" },
    { header: t("col.class"), accessor: "class", className: "hidden lg:table-cell" },
    { header: t("col.date"), accessor: "date", className: "hidden lg:table-cell" },
    { header: t("col.actions"), accessor: "action" },
  ];
  const { user } = useAuth();
  const role = user?.role;
  const canEdit = role === "school_admin" || role === "platform_admin" || role === "teacher";

  const { data, loading } = useSupabaseQuery<GradeRow>({
    table: "grades",
    select: `
      id, exam_type, score, max_score, term, created_at,
      student:profiles!student_id(first_name, last_name),
      subject:subjects(name),
      class:classes(name),
      recorded_by_profile:profiles!recorded_by(first_name, last_name)
    `,
    orderBy: { column: "created_at", ascending: false },
  });

  const renderRow = (item: GradeRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="flex items-center gap-4 p-4">{item.subject?.name || "—"}</td>
      <td>{item.student ? `${item.student.first_name} ${item.student.last_name}` : "—"}</td>
      <td className="hidden md:table-cell">
        <span className="font-semibold">{item.score}</span>
        <span className="text-gray-400">/{item.max_score}</span>
      </td>
      <td className="hidden md:table-cell capitalize">{item.exam_type}</td>
      <td className="hidden lg:table-cell">{item.class?.name || "—"}</td>
      <td className="hidden lg:table-cell">{new Date(item.created_at).toLocaleDateString()}</td>
      <td>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <FormModal table="result" type="update" data={item} />
              <FormModal table="result" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading results...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">{t("titles.results")}</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {canEdit && <FormModal table="result" type="create" />}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default ResultListPage;
