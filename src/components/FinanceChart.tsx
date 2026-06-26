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
import { useI18n } from "@/contexts/LanguageContext";

interface FeeRow {
  paid_amount: number | null;
  paid_at: string | null;
  created_at: string | null;
}
interface PayrollRow {
  net_salary: number | null;
  paid_at: string | null;
  created_at: string | null;
}
interface ExpenseRow {
  amount: number | null;
  paid_at: string | null;
  created_at: string | null;
}

const MONTH_KEYS = [
  "fin.monthJan", "fin.monthFeb", "fin.monthMar", "fin.monthApr", "fin.monthMay", "fin.monthJun",
  "fin.monthJul", "fin.monthAug", "fin.monthSep", "fin.monthOct", "fin.monthNov", "fin.monthDec",
];
const fmtMoney = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Bucket date for a transaction: prefer paid_at (when the money actually
 *  moved), otherwise fall back to created_at so rows recorded without an
 *  explicit paid_at still land on the chart and in the totals. */
const bucketDate = (paidAt: string | null, createdAt: string | null) => paidAt ?? createdAt;

/** Finance chart for the admin dashboard.
 *  - **Income** = sum of `student_fees.paid_amount` for the school
 *    (all-time on the stat card, monthly current-year on the bar chart)
 *  - **Expense** = sum of `payroll.net_salary` for the school where
 *    `status = 'paid'` (same time bases)
 *  The totals match the Student Fees page's "Collected" KPI so the two
 *  surfaces stay in sync; the chart bars show the calendar-year
 *  distribution. */
const FinanceChart = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [salaries, setSalaries] = useState<PayrollRow[]>([]);
  const [opExpenses, setOpExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const year = new Date().getFullYear();

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.schoolId) { setLoading(false); return; }
      setLoading(true);

      // Pull every paid_amount and every paid payroll row for the school,
      // regardless of paid_at — this is what makes the totals match the
      // Student Fees page. The bar chart still buckets per month using
      // bucketDate() below.
      const [feeRes, payRes, expRes] = await Promise.all([
        supabase
          .from("student_fees")
          .select("paid_amount, paid_at, created_at")
          .eq("school_id", user.schoolId)
          .gt("paid_amount", 0),
        supabase
          .from("payroll")
          .select("net_salary, paid_at, created_at")
          .eq("school_id", user.schoolId)
          .eq("status", "paid"),
        supabase
          .from("expenses")
          .select("amount, paid_at, created_at")
          .eq("school_id", user.schoolId)
          .eq("status", "paid"),
      ]);

      setFees((feeRes.data as FeeRow[]) || []);
      setSalaries((payRes.data as PayrollRow[]) || []);
      setOpExpenses((expRes.data as ExpenseRow[]) || []);
      setLoading(false);
    };
    load();
  }, [user?.schoolId, year]);

  const months = useMemo(() => MONTH_KEYS.map((k) => t(k)), [t]);

  const chartData = useMemo(() => {
    // Per-month movements first…
    const incomeM = new Array(12).fill(0);
    const expenseM = new Array(12).fill(0);
    fees.forEach((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      if (!d) return;
      const t = new Date(d);
      if (t.getFullYear() !== year) return;
      incomeM[t.getMonth()] += r.paid_amount ?? 0;
    });
    salaries.forEach((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      if (!d) return;
      const t = new Date(d);
      if (t.getFullYear() !== year) return;
      expenseM[t.getMonth()] += r.net_salary ?? 0;
    });
    opExpenses.forEach((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      if (!d) return;
      const t = new Date(d);
      if (t.getFullYear() !== year) return;
      expenseM[t.getMonth()] += r.amount ?? 0;
    });
    // …then accumulate so each line is a *running total*. Income rises as money
    // comes in and never falls back to zero; expense rises as money is paid out;
    // balance (income − expense) is what's actually left in the bank that month.
    let cumIncome = 0;
    let cumExpense = 0;
    return months.map((name, i) => {
      cumIncome += incomeM[i];
      cumExpense += expenseM[i];
      return { name, income: cumIncome, expense: cumExpense, balance: cumIncome - cumExpense };
    });
  }, [fees, salaries, opExpenses, year, months]);

  const totals = useMemo(() => {
    const income = fees.reduce((s, r) => s + (r.paid_amount ?? 0), 0);
    const expense =
      salaries.reduce((s, r) => s + (r.net_salary ?? 0), 0) +
      opExpenses.reduce((s, r) => s + (r.amount ?? 0), 0);
    return { income, expense, net: income - expense };
  }, [fees, salaries, opExpenses]);

  return (
    <div className="bg-white rounded-xl w-full h-full p-4 flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">{t("fin.finance")}</h1>
        <Image src="/moreDark.png" alt="" width={20} height={20} />
      </div>

      {/* All-time totals — stay in sync with the Student Fees "Collected" KPI */}
      <div className="grid grid-cols-3 gap-3 mt-2 mb-3">
        <Stat label={t("fin.income")} value={fmtMoney(totals.income)} tone="text-green-600" sub={t("fin.allTimeCollected")} />
        <Stat label={t("fin.expense")} value={fmtMoney(totals.expense)} tone="text-red-600" sub={t("fin.allTimePaidOut")} />
        <Stat
          label={t("fin.net")}
          value={fmtMoney(totals.net)}
          tone={totals.net >= 0 ? "text-blue-600" : "text-red-600"}
          sub={t("fin.incomeMinusExpense")}
        />
      </div>

      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{t("fin.yearRunningBalance", { year })}</p>
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none">
            {t("fin.loadingEllipsis")}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
            <XAxis dataKey="name" axisLine={false} tick={{ fill: "#9ca3af" }} tickLine={false} tickMargin={10} />
            <YAxis
              axisLine={false}
              tick={{ fill: "#9ca3af" }}
              tickLine={false}
              tickMargin={20}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend align="center" verticalAlign="top" wrapperStyle={{ paddingTop: "10px", paddingBottom: "20px" }} />
            <Line type="monotone" dataKey="income" name={t("fin.income")} stroke="#3a6d9a" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="expense" name={t("fin.expense")} stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="balance" name={t("fin.balance")} stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) => (
  <div className="bg-gray-50 rounded-lg px-3 py-2">
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-sm font-bold mt-0.5 truncate ${tone}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>}
  </div>
);

export default FinanceChart;
