"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type LessonRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: { name: string } | null;
  class: { name: string } | null;
  teacher: { first_name: string; last_name: string } | null;
};

const columns = [
  { header: "Subject", accessor: "subject" },
  { header: "Class", accessor: "class" },
  { header: "Teacher", accessor: "teacher", className: "hidden md:table-cell" },
  { header: "Day", accessor: "day", className: "hidden md:table-cell" },
  { header: "Time", accessor: "time", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

const LessonListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<LessonRow>({
    table: "lessons",
    select: "id, day_of_week, start_time, end_time, subject:subjects(name), class:classes(name), teacher:profiles!teacher_id(first_name, last_name)",
    orderBy: { column: "day_of_week", ascending: true },
  });

  const renderRow = (item: LessonRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="flex items-center gap-4 p-4">{item.subject?.name || "—"}</td>
      <td>{item.class?.name || "—"}</td>
      <td className="hidden md:table-cell">
        {item.teacher ? `${item.teacher.first_name} ${item.teacher.last_name}` : "—"}
      </td>
      <td className="hidden md:table-cell">{DAYS[item.day_of_week] || "—"}</td>
      <td className="hidden lg:table-cell">{item.start_time?.slice(0, 5)} – {item.end_time?.slice(0, 5)}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "school_admin" || role === "platform_admin") && (
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
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading lessons...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Lessons</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {(role === "school_admin" || role === "platform_admin") && (
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

export default LessonListPage;
