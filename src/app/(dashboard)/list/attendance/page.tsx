"use client";

import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  student: { first_name: string; last_name: string } | null;
  class: { name: string } | null;
};

const columns = [
  { header: "Student", accessor: "student" },
  { header: "Class", accessor: "class", className: "hidden md:table-cell" },
  { header: "Date", accessor: "date" },
  { header: "Status", accessor: "status" },
];

const AttendancePage = () => {
  const { user } = useAuth();

  const { data, loading } = useSupabaseQuery<AttendanceRow>({
    table: "attendance",
    select: "id, date, status, student:profiles!student_id(first_name, last_name), class:classes(name)",
    orderBy: { column: "date", ascending: false },
  });

  const renderRow = (item: AttendanceRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="p-4">{item.student ? `${item.student.first_name} ${item.student.last_name}` : "—"}</td>
      <td className="hidden md:table-cell">{item.class?.name || "—"}</td>
      <td>{item.date || "—"}</td>
      <td>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          item.status === "present" ? "bg-green-100 text-green-700" :
          item.status === "absent" ? "bg-red-100 text-red-700" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {item.status || "—"}
        </span>
      </td>
    </tr>
  );

  if (loading) return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading attendance...</div>;

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Attendance Records</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
    </div>
  );
};

export default AttendancePage;
