"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useI18n } from "@/contexts/LanguageContext";
import Image from "next/image";

type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  teachers: { teacher: { first_name: string; last_name: string } }[];
};


const SubjectListPage = () => {
  const { t } = useI18n();
  const columns = [
  { header: t("col.subjectName"), accessor: "name" },
  { header: t("col.code"), accessor: "code", className: "hidden md:table-cell" },
  { header: t("col.teachers"), accessor: "teachers", className: "hidden md:table-cell" },
  { header: t("col.actions"), accessor: "action" },
];
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<SubjectRow>({
    table: "subjects",
    select: "id, name, code, teachers:class_subjects(teacher:profiles!teacher_id(first_name, last_name))",
    orderBy: { column: "name", ascending: true },
  });

  const renderRow = (item: SubjectRow) => {
    const teacherNames = Array.from(new Set(
      (item.teachers || []).map((t: any) => `${t.teacher?.first_name} ${t.teacher?.last_name}`).filter((n: string) => n.trim())
    ));

    return (
      <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
        <td className="flex items-center gap-4 p-4">{item.name}</td>
        <td className="hidden md:table-cell">{item.code || "—"}</td>
        <td className="hidden md:table-cell">{teacherNames.join(", ") || "—"}</td>
        <td>
          <div className="flex items-center gap-2">
            {(role === "school_admin" || role === "platform_admin") && (
              <>
                <FormModal table="subject" type="update" data={item} />
                <FormModal table="subject" type="delete" id={item.id} />
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading subjects...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">{t("titles.subjects")}</h1>
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
              <FormModal table="subject" type="create" />
            )}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default SubjectListPage;
