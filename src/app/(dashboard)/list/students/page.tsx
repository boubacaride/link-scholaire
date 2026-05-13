"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";
import Link from "next/link";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  address: string | null;
  enrollment: { class: { name: string; grade: number } }[];
};

const columns = [
  { header: "Info", accessor: "info" },
  { header: "Grade", accessor: "grade", className: "hidden md:table-cell" },
  { header: "Phone", accessor: "phone", className: "hidden lg:table-cell" },
  { header: "Address", accessor: "address", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

const StudentListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<StudentRow>({
    table: "profiles",
    select: `
      id, first_name, last_name, email, phone, avatar_url, address,
      enrollment:student_classes(class:classes(name, grade))
    `,
    filters: [{ column: "role", value: "student" }],
    orderBy: { column: "last_name", ascending: true },
  });

  const renderRow = (item: StudentRow) => {
    const enrollment = (item.enrollment || [])[0];
    const className = enrollment?.class?.name || "—";
    const grade = enrollment?.class?.grade || "—";

    return (
      <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
        <td className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-full bg-lamaYellow flex items-center justify-center font-semibold text-sm">
            {item.first_name?.[0]}{item.last_name?.[0]}
          </div>
          <div className="flex flex-col">
            <h3 className="font-semibold">{item.first_name} {item.last_name}</h3>
            <p className="text-xs text-gray-500">{className}</p>
          </div>
        </td>
        <td className="hidden md:table-cell">{grade}</td>
        <td className="hidden lg:table-cell">{item.phone || "—"}</td>
        <td className="hidden lg:table-cell">{item.address || "—"}</td>
        <td>
          <div className="flex items-center gap-2">
            <Link href={`/list/students/${item.id}`}>
              <button className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky">
                <Image src="/view.png" alt="" width={16} height={16} />
              </button>
            </Link>
            {(role === "school_admin" || role === "platform_admin") && (
              <>
                <FormModal table="student" type="update" data={item} />
                <FormModal table="student" type="delete" id={item.id} />
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading students...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Students</h1>
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
              <FormModal table="student" type="create" />
            )}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default StudentListPage;
