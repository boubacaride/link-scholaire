"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface FeeRow {
  paid_amount: number | null;
  paid_at: string | null;
}
interface PayrollRow {
  net_salary: number | null;
  paid_at: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMoney = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Finance chart for the admin dashboard. Aggregates real income and expense
 *  transactions for the current calendar year by month:
 *   - Income  = sum of `paid_amount` from `student_fees` whose `paid_at`
 *               falls in that month (fee payments received)
 *   - Expense = sum of `net_salary` from `payroll` whose `paid_at` falls in
 *               that month and whose `status = 'paid'` (salaries paid out)
 *  Both queries are RLS-safe and school-scoped via `school_id`. */
const FinanceChart = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [salaries, setSalaries] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);

  const year = new Date().getFullYear();

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.schoolId) { setLoading(false); return; }
      setLoading(true);
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31T23:59:59`;

      const [feeRes, payRes] = await Promise.all([
        supabase
          .from("student_fees")
          .select("paid_amount, paid_at")
          .eq("school_id", user.schoolId)
          .not("paid_at", "is", null)
          .gte("paid_at", yearStart)
          .lte("paid_at", yearEnd),
        supabase
          .from("payroll")
          .select("net_salary, paid_at")
          .eq("school_id", user.schoolId)
          .eq("status", "paid")
          .not("paid_at", "is", null)
          .gte("paid_at", yearStart)
          .lte("paid_at", yearEnd),
      ]);

      setFees((feeRes.data as FeeRow[]) || []);
      setSalaries((payRes.data as PayrollRow[]) || []);
      setLoading(false);
    };
    load();
  }, [user?.schoolId, year]);

  const data = useMemo(() => {
    const income = new Array(12).fill(0);
    const expense = new Array(12).fill(0);
    fees.forEach((r) => {
      if (!r.paid_at) return;
      const m = new Date(r.paid_at).getMonth();
      income[m] += r.paid_amount ?? 0;
    });
    salaries.forEach((r) => {
      if (!r.paid_at) return;
      const m = new Date(r.paid_at).getMonth();
      expense[m] += r.net_salary ?? 0;
    });
    return MONTHS.map((name, i) => ({ name, income: income[i], expense: expense[i] }));
  }, [fees, salaries]);

  const totals = useMemo(() => {
    const income = data.reduce((s, d) => s + d.income, 0);
    const expense = data.reduce((s, d) => s + d.expense, 0);
    return { income, expense, net: income - expense };
  }, [data]);

  return (
    <div className="bg-white rounded-xl w-full h-full p-4 flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Finance · {year}</h1>
        <Image src="/moreDark.png" alt="" width={20} height={20} />
      </div>

      {/* Year-to-date totals */}
      <div className="grid grid-cols-3 gap-3 mt-2 mb-3">
        <Stat label="Income" value={fmtMoney(totals.income)} tone="text-green-600" />
        <Stat label="Expense" value={fmtMoney(totals.expense)} tone="text-red-600" />
        <Stat label="Net" value={fmtMoney(totals.net)} tone={totals.net >= 0 ? "text-blue-600" : "text-red-600"} />
      </div>

      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none">
            Loading…
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
            <XAxis dataKey="name" axisLine={false} tick={{ fill: "#9ca3af" }} tickLine={false} tickMargin={10} />
            <YAxis axisLine={false} tick={{ fill: "#9ca3af" }} tickLine={false} tickMargin={20}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend align="center" verticalAlign="top" wrapperStyle={{ paddingTop: "10px", paddingBottom: "20px" }} />
            <Line type="monotone" dataKey="income" stroke="#3a6d9a" strokeWidth={3} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <div className="bg-gray-50 rounded-lg px-3 py-2">
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-sm font-bold mt-0.5 truncate ${tone}`}>{value}</p>
  </div>
);

export default FinanceChart;
