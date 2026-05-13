"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";
import Link from "next/link";

type TeacherRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  address: string | null;
  subjects: { name: string }[];
  classes: { name: string }[];
};

const columns = [
  { header: "Info", accessor: "info" },
  { header: "Subjects", accessor: "subjects", className: "hidden md:table-cell" },
  { header: "Classes", accessor: "classes", className: "hidden md:table-cell" },
  { header: "Phone", accessor: "phone", className: "hidden lg:table-cell" },
  { header: "Address", accessor: "address", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

const TeacherListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<TeacherRow>({
    table: "profiles",
    select: `
      id, first_name, last_name, email, phone, avatar_url, address,
      subjects:class_subjects(subject:subjects(name)),
      classes:class_subjects(class:classes(name))
    `,
    filters: [{ column: "role", value: "teacher" }],
    orderBy: { column: "last_name", ascending: true },
  });

  const renderRow = (item: TeacherRow) => {
    const subjectNames = Array.from(new Set(
      (item.subjects || []).map((s: any) => s.subject?.name).filter(Boolean)
    ));
    const classNames = Array.from(new Set(
      (item.classes || []).map((c: any) => c.class?.name).filter(Boolean)
    ));

    return (
      <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
        <td className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-full bg-lamaSky flex items-center justify-center text-white font-semibold">
            {item.first_name?.[0]}{item.last_name?.[0]}
          </div>
          <div className="flex flex-col">
            <h3 className="font-semibold">{item.first_name} {item.last_name}</h3>
            <p className="text-xs text-gray-500">{item.email}</p>
          </div>
        </td>
        <td className="hidden md:table-cell">{subjectNames.join(", ") || "—"}</td>
        <td className="hidden md:table-cell">{classNames.join(", ") || "—"}</td>
        <td className="hidden lg:table-cell">{item.phone || "—"}</td>
        <td className="hidden lg:table-cell">{item.address || "—"}</td>
        <td>
          <div className="flex items-center gap-2">
            <Link href={`/list/teachers/${item.id}`}>
              <button className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky">
                <Image src="/view.png" alt="" width={16} height={16} />
              </button>
            </Link>
            {(role === "school_admin" || role === "platform_admin") && (
              <>
                <FormModal table="teacher" type="update" data={item} />
                <FormModal table="teacher" type="delete" id={item.id} />
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading teachers...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Teachers</h1>
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
              <FormModal table="teacher" type="create" />
            )}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default TeacherListPage;
