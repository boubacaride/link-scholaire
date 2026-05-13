"use client";

import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import Image from "next/image";

type PayrollRow = {
  id: string;
  amount: number;
  pay_date: string;
  status: string;
  employee: { first_name: string; last_name: string } | null;
};

const columns = [
  { header: "Employee", accessor: "employee" },
  { header: "Amount", accessor: "amount" },
  { header: "Pay Date", accessor: "pay_date", className: "hidden md:table-cell" },
  { header: "Status", accessor: "status" },
];

const PayrollPage = () => {
  const { user } = useAuth();

  const { data, loading } = useSupabaseQuery<PayrollRow>({
    table: "payroll",
    select: "id, amount, pay_date, status, employee:profiles!employee_id(first_name, last_name)",
    orderBy: { column: "pay_date", ascending: false },
  });

  const renderRow = (item: PayrollRow) => (
    <tr key={item.id} className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight">
      <td className="p-4">{item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : "—"}</td>
      <td className="font-medium">${item.amount?.toFixed(2) || "0.00"}</td>
      <td className="hidden md:table-cell">{item.pay_date || "—"}</td>
      <td>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          item.status === "paid" ? "bg-green-100 text-green-700" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {item.status || "pending"}
        </span>
      </td>
    </tr>
  );

  if (loading) return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading payroll...</div>;

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Payroll</h1>
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

export default PayrollPage;
