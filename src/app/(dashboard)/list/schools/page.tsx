"use client";

import { useCallback, useEffect, useState } from "react";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import SchoolOnboardModal from "@/components/dashboard/SchoolOnboardModal";
import SchoolAdminsModal from "@/components/dashboard/SchoolAdminsModal";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
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
  { header: "Subscription", accessor: "status" },
  { header: "Admin", accessor: "admin" },
];

const STATUS_PILL: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trial: "bg-blue-100 text-blue-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const STATUSES = ["active", "trial", "expired", "cancelled"];

const SchoolsListPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const isPlatform = role === "platform_admin";
  const supabase = createClient();

  const [data, setData] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [manageSchool, setManageSchool] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data: rows } = await supabase
      .from("schools")
      .select("id, name, type, city, country, email, phone, subscription_status, subscription_plan, max_students, max_teachers, created_at")
      .order("name", { ascending: true });
    // Hide the platform's own org school — it isn't a tenant.
    setData(((rows as SchoolRow[]) || []).filter((s) => s.subscription_plan !== "platform"));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    if (!supabase) return;
    setData((prev) => prev.map((s) => (s.id === id ? { ...s, subscription_status: status } : s)));
    await supabase.from("schools").update({ subscription_status: status }).eq("id", id);
  };

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
        {isPlatform ? (
          <select
            value={item.subscription_status}
            onChange={(e) => updateStatus(item.id, e.target.value)}
            className={`text-xs font-medium capitalize rounded-full px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-blue-200 ${STATUS_PILL[item.subscription_status] || "bg-gray-100 text-gray-600"}`}
            title="Authorize or suspend this school's subscription"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_PILL[item.subscription_status] || "bg-gray-100 text-gray-600"}`}>
            {item.subscription_status}
          </span>
        )}
      </td>
      <td>
        {isPlatform && (
          <button
            onClick={() => setManageSchool({ id: item.id, name: item.name })}
            className="text-xs bg-lamaSky text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Manage Admin
          </button>
        )}
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
            {isPlatform && (
              <button
                onClick={() => setShowModal(true)}
                className="text-sm bg-blue-600 text-white px-3.5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                + Onboard School
              </button>
            )}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="p-8 text-center">
          <div className="text-4xl mb-2">🏫</div>
          <p className="text-gray-500 text-sm">No schools yet.</p>
          {isPlatform && <p className="text-gray-400 text-xs mt-1">Click “Onboard School” to create one and its admin.</p>}
        </div>
      ) : (
        <Table columns={columns} renderRow={renderRow} data={data} />
      )}

      {showModal && (
        <SchoolOnboardModal onClose={() => setShowModal(false)} onCreated={load} />
      )}

      {manageSchool && (
        <SchoolAdminsModal
          schoolId={manageSchool.id}
          schoolName={manageSchool.name}
          onClose={() => setManageSchool(null)}
          onSchoolDeleted={load}
        />
      )}
    </div>
  );
};

export default SchoolsListPage;
