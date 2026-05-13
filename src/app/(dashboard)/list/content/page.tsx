"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

type ContentRow = {
  id: string;
  title: string;
  type: "lesson" | "assignment" | "exam" | "classwork";
  is_published: boolean;
  due_date: string | null;
  created_at: string;
  subject: { name: string } | null;
  class: { name: string } | null;
  teacher: { first_name: string; last_name: string } | null;
};

const columns = [
  { header: "Title", accessor: "title" },
  { header: "Type", accessor: "type" },
  { header: "Subject", accessor: "subject", className: "hidden md:table-cell" },
  { header: "Class", accessor: "class", className: "hidden md:table-cell" },
  { header: "Teacher", accessor: "teacher", className: "hidden lg:table-cell" },
  { header: "Status", accessor: "status", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

const typeColors: Record<string, string> = {
  lesson: "bg-blue-100 text-blue-700",
  assignment: "bg-orange-100 text-orange-700",
  exam: "bg-red-100 text-red-700",
  classwork: "bg-green-100 text-green-700",
};

const ContentListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<ContentRow>({
    table: "content",
    select: "id, title, type, is_published, due_date, created_at, subject:subjects(name), class:classes(name), teacher:profiles!teacher_id(first_name, last_name)",
    orderBy: { column: "created_at", ascending: false },
  });

  const renderRow = (item: ContentRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="p-4 font-medium">{item.title}</td>
      <td>
        <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${typeColors[item.type] || "bg-gray-100 text-gray-600"}`}>
          {item.type}
        </span>
      </td>
      <td className="hidden md:table-cell">{item.subject?.name || "—"}</td>
      <td className="hidden md:table-cell">{item.class?.name || "—"}</td>
      <td className="hidden lg:table-cell">
        {item.teacher ? `${item.teacher.first_name} ${item.teacher.last_name}` : "—"}
      </td>
      <td className="hidden lg:table-cell">
        <span className={`text-xs px-2 py-1 rounded-full ${item.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {item.is_published ? "Published" : "Draft"}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "school_admin" || role === "platform_admin" || role === "teacher") && (
            <>
              <FormModal table="lesson" type="update" data={item} />
              <FormModal table="lesson" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading content...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Content</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {(role === "school_admin" || role === "platform_admin" || role === "teacher") && (
              <FormModal table="lesson" type="create" />
            )}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default ContentListPage;
