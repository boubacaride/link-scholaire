"use client";

import { useEffect, useState } from "react";
import FormModal from "@/components/FormModal";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface Employee {
  id: string;
  member_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  employee_category: string | null;
  job_title: string | null;
  hire_date: string | null;
  termination_date: string | null;
  is_active: boolean;
}

const EmployeesPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "terminated" | "all">("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const canEdit = user?.role === "school_admin" || user?.role === "platform_admin";

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.schoolId) { setLoading(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id, member_id, first_name, last_name, email, phone, employee_category, job_title, hire_date, termination_date, is_active")
        .eq("school_id", user.schoolId)
        .eq("role", "employee")
        .order("last_name");
      setRows((data as Employee[]) || []);
      setLoading(false);
    };
    load();
  }, [user?.schoolId]);

  const visible = rows.filter((r) => {
    if (filter === "active") return r.is_active;
    if (filter === "terminated") return !r.is_active;
    return true;
  });

  const terminate = async (id: string) => {
    if (!supabase) return;
    if (!confirm(t("emp.confirmTerminate"))) return;
    setBusyId(id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false, termination_date: today })
        .eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: false, termination_date: today } : r)));
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const reinstate = async (id: string) => {
    if (!supabase) return;
    setBusyId(id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: true, termination_date: null })
        .eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: true, termination_date: null } : r)));
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    { header: t("emp.colName"), accessor: "name" },
    { header: "Employee ID", accessor: "member_id", className: "hidden md:table-cell" },
    { header: t("emp.colCategory"), accessor: "category", className: "hidden md:table-cell" },
    { header: t("emp.colJobTitle"), accessor: "title" },
    { header: t("emp.colHireDate"), accessor: "hire_date", className: "hidden lg:table-cell" },
    { header: t("emp.colStatus"), accessor: "status" },
    ...(canEdit ? [{ header: t("emp.colActions"), accessor: "actions" }] : []),
  ];

  const renderRow = (item: Employee) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="p-4">
        <p className="font-medium">{item.first_name} {item.last_name}</p>
        <p className="text-[11px] text-gray-400">{item.email}</p>
      </td>
      <td className="hidden md:table-cell font-mono text-xs tracking-wider text-gray-700">
        {item.member_id || "—"}
      </td>
      <td className="hidden md:table-cell text-gray-600">{item.employee_category || "—"}</td>
      <td>{item.job_title || "—"}</td>
      <td className="hidden lg:table-cell text-gray-500">
        {item.hire_date ? new Date(item.hire_date).toLocaleDateString() : "—"}
      </td>
      <td>
        {item.is_active ? (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">{t("emp.statusActive")}</span>
        ) : (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {t("emp.statusTerminated")}{item.termination_date ? ` · ${new Date(item.termination_date).toLocaleDateString()}` : ""}
          </span>
        )}
      </td>
      {canEdit && (
        <td>
          <div className="flex items-center gap-2">
            <FormModal table="employee" type="update" data={item} />
            {item.is_active ? (
              <button
                onClick={() => terminate(item.id)}
                disabled={busyId === item.id}
                className="text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {t("emp.terminate")}
              </button>
            ) : (
              <button
                onClick={() => reinstate(item.id)}
                disabled={busyId === item.id}
                className="text-[11px] font-medium text-green-600 hover:text-green-700 disabled:opacity-50"
              >
                {t("emp.reinstate")}
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );

  if (loading) return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">{t("emp.loading")}</div>;

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="hidden md:block text-lg font-semibold">{t("emp.title")}</h1>
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
            {(["active", "terminated", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  filter === f ? "bg-[#1f3a5f] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f === "active"
                  ? t("emp.filterActive")
                  : f === "terminated"
                  ? t("emp.filterTerminated")
                  : t("emp.filterAll")}
              </button>
            ))}
          </div>
          <TableSearch />
          {canEdit && <FormModal table="employee" type="create" />}
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={visible} />
    </div>
  );
};

export default EmployeesPage;
