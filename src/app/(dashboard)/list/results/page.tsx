"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
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

const columns = [
  { header: "Subject", accessor: "subject" },
  { header: "Student", accessor: "student" },
  { header: "Score", accessor: "score", className: "hidden md:table-cell" },
  { header: "Type", accessor: "type", className: "hidden md:table-cell" },
  { header: "Class", accessor: "class", className: "hidden lg:table-cell" },
  { header: "Date", accessor: "date", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

const ResultListPage = () => {
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
      <td>
        {item.student ? `${item.student.first_name} ${item.student.last_name}` : "—"}
      </td>
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
        <h1 className="hidden md:block text-lg font-semibold">All Results</h1>
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
