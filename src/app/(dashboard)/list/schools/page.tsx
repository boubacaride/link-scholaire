"use client";

import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

type SchoolRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  max_students: number;
  max_teachers: number;
  created_at: string;
};

const columns = [
  { header: "School", accessor: "school" },
  { header: "Location", accessor: "location", className: "hidden md:table-cell" },
  { header: "Type", accessor: "type", className: "hidden md:table-cell" },
  { header: "Plan", accessor: "plan", className: "hidden lg:table-cell" },
  { header: "Capacity", accessor: "capacity", className: "hidden lg:table-cell" },
  { header: "Status", accessor: "status" },
];

const STATUS_PILL: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trial: "bg-blue-100 text-blue-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const SchoolsListPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const { data, loading } = useSupabaseQuery<SchoolRow>({
    table: "schools",
    select: `id, name, type, city, country, email, phone, subscription_status, subscription_plan, max_students, max_teachers, created_at`,
    orderBy: { column: "name", ascending: true },
  });

  if (role && role !== "platform_admin") {
    return (
      <div className="bg-white p-8 rounded-md flex-1 m-4 mt-0 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-gray-600 text-sm">Schools management is available to platform administrators only.</p>
      </div>
    );
  }

  const renderRow = (item: SchoolRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-lg bg-lamaSky flex items-center justify-center text-white font-semibold">
          {item.name?.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item.email || "—"}</p>
        </div>
      </td>
      <td className="hidden md:table-cell">{[item.city, item.country].filter(Boolean).join(", ") || "—"}</td>
      <td className="hidden md:table-cell capitalize">{item.type}</td>
      <td className="hidden lg:table-cell">{item.subscription_plan || "—"}</td>
      <td className="hidden lg:table-cell">{item.max_students} students · {item.max_teachers} staff</td>
      <td>
        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_PILL[item.subscription_status] || "bg-gray-100 text-gray-600"}`}>
          {item.subscription_status}
        </span>
      </td>
    </tr>
  );

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading schools...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Schools</h1>
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
      {data.length === 0 ? (
        <div className="p-8 text-center">
          <div className="text-4xl mb-2">🏫</div>
          <p className="text-gray-500 text-sm">No schools to display.</p>
        </div>
      ) : (
        <Table columns={columns} renderRow={renderRow} data={data} />
      )}
    </div>
  );
};

export default SchoolsListPage;
