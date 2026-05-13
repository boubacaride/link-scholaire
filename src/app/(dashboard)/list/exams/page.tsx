"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

type ExamRow = {
  id: string;
  title: string;
  type: string;
  due_date: string | null;
  max_score: number | null;
  subject: { name: string } | null;
  class: { name: string } | null;
  teacher: { first_name: string; last_name: string } | null;
};

const columns = [
  { header: "Title", accessor: "title" },
  { header: "Subject", accessor: "subject" },
  { header: "Class", accessor: "class", className: "hidden md:table-cell" },
  { header: "Teacher", accessor: "teacher", className: "hidden md:table-cell" },
  { header: "Date", accessor: "date", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

const ExamListPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const canEdit = role === "school_admin" || role === "platform_admin" || role === "teacher";

  const { data, loading } = useSupabaseQuery<ExamRow>({
    table: "content",
    select: "id, title, type, due_date, max_score, subject:subjects(name), class:classes(name), teacher:profiles!teacher_id(first_name, last_name)",
    filters: [{ column: "type", value: "classwork" }],
    orderBy: { column: "due_date", ascending: false },
  });

  const renderRow = (item: ExamRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="flex items-center gap-4 p-4">{item.title}</td>
      <td>{item.subject?.name || "—"}</td>
      <td className="hidden md:table-cell">{item.class?.name || "—"}</td>
      <td className="hidden md:table-cell">
        {item.teacher ? `${item.teacher.first_name} ${item.teacher.last_name}` : "—"}
      </td>
      <td className="hidden lg:table-cell">
        {item.due_date ? new Date(item.due_date).toLocaleDateString() : "—"}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <FormModal table="exam" type="update" data={item} />
              <FormModal table="exam" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading exams...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Exams</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {canEdit && <FormModal table="exam" type="create" />}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default ExamListPage;
