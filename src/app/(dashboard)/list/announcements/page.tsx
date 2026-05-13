"use client";

import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

type AnnouncementRow = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  class: { name: string } | null;
  author: { first_name: string; last_name: string } | null;
};

const columns = [
  { header: "Title", accessor: "title" },
  { header: "Class", accessor: "class" },
  { header: "Author", accessor: "author", className: "hidden md:table-cell" },
  { header: "Date", accessor: "date", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

const AnnouncementListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<AnnouncementRow>({
    table: "announcements",
    select: "id, title, description, created_at, class:classes(name), author:profiles!author_id(first_name, last_name)",
    orderBy: { column: "created_at", ascending: false },
  });

  const renderRow = (item: AnnouncementRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="flex items-center gap-4 p-4">{item.title}</td>
      <td>{item.class?.name || "School-wide"}</td>
      <td className="hidden md:table-cell">
        {item.author ? `${item.author.first_name} ${item.author.last_name}` : "—"}
      </td>
      <td className="hidden md:table-cell">{new Date(item.created_at).toLocaleDateString()}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "school_admin" || role === "platform_admin") && (
            <>
              <FormModal table="announcement" type="update" data={item} />
              <FormModal table="announcement" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading announcements...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Announcements</h1>
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
              <FormModal table="announcement" type="create" />
            )}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
      <Pagination />
    </div>
  );
};

export default AnnouncementListPage;
