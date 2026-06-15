"use client";

import FormModal from "@/components/FormModal";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useI18n } from "@/contexts/LanguageContext";
import Image from "next/image";

type PayrollRow = {
  id: string;
  employee_id: string;
  base_salary: number;
  deductions: number;
  bonuses: number;
  net_salary: number;
  pay_period: string;
  paid_at: string | null;
  status: string;
  notes: string | null;
  employee: { first_name: string; last_name: string; role: string } | null;
};

const PayrollPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = user?.role === "school_admin" || user?.role === "platform_admin";

  const columns = [
    { header: t("fin.colEmployee"), accessor: "employee" },
    { header: t("fin.colPeriod"), accessor: "pay_period", className: "hidden md:table-cell" },
    { header: t("fin.colNetSalary"), accessor: "net_salary" },
    { header: t("fin.colPaidAt"), accessor: "paid_at", className: "hidden md:table-cell" },
    { header: t("fin.colStatus"), accessor: "status" },
    ...(canEdit ? [{ header: t("fin.colActions"), accessor: "action" }] : []),
  ];

  const statusLabel = (s: string) =>
    s === "paid" ? t("fin.statusPaid")
    : s === "overdue" ? t("fin.statusOverdue")
    : s === "partial" ? t("fin.statusPartial")
    : t("fin.statusPending");

  const { data, loading } = useSupabaseQuery<PayrollRow>({
    table: "payroll",
    select: "id, employee_id, base_salary, deductions, bonuses, net_salary, pay_period, paid_at, status, notes, employee:profiles!employee_id(first_name, last_name, role)",
    orderBy: { column: "created_at", ascending: false },
  });

  const renderRow = (item: PayrollRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="p-4">
        {item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : "—"}
        {item.employee?.role && (
          <p className="text-[11px] text-gray-400 capitalize">{item.employee.role.replace("_", " ")}</p>
        )}
      </td>
      <td className="hidden md:table-cell">{item.pay_period || "—"}</td>
      <td className="font-medium">${(item.net_salary ?? 0).toLocaleString()}</td>
      <td className="hidden md:table-cell text-gray-500">
        {item.paid_at ? new Date(item.paid_at).toLocaleDateString() : "—"}
      </td>
      <td>
        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
          item.status === "paid" ? "bg-green-100 text-green-700" :
          item.status === "overdue" ? "bg-red-100 text-red-700" :
          item.status === "partial" ? "bg-blue-100 text-blue-700" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {statusLabel(item.status || "pending")}
        </span>
      </td>
      {canEdit && (
        <td>
          <div className="flex items-center gap-2">
            <FormModal table="payroll" type="update" data={item} />
            <FormModal table="payroll" type="delete" id={item.id} />
          </div>
        </td>
      )}
    </tr>
  );

  if (loading) return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">{t("fin.loadingPayroll")}</div>;

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">{t("fin.titlePayroll")}</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {canEdit && <FormModal table="payroll" type="create" />}
          </div>
        </div>
      </div>
      <Table columns={columns} renderRow={renderRow} data={data} />
    </div>
  );
};

export default PayrollPage;
