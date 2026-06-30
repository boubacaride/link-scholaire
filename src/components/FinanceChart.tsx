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
  fee_type: string | null;
  student_id: string | null;
}
interface PayrollRow {
  net_salary: number | null;
  paid_at: string | null;
  created_at: string | null;
  employee_id: string | null;
}
interface ExpenseRow {
  amount: number | null;
  paid_at: string | null;
  created_at: string | null;
  title: string | null;
  category: string | null;
}

/** A single transaction for the click-to-drill "last 3" panel. */
interface Tx { ts: number; date: string; amount: number; label: string }

const MONTH_KEYS = [
  "fin.monthJan", "fin.monthFeb", "fin.monthMar", "fin.monthApr", "fin.monthMay", "fin.monthJun",
  "fin.monthJul", "fin.monthAug", "fin.monthSep", "fin.monthOct", "fin.monthNov", "fin.monthDec",
];
const fmtMoney = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Axis tick: negative-safe "k" formatting (the old formatter only handled
 *  positives, so negative balances rendered as raw "-400000"). */
const fmtK = (v: number) => (v === 0 ? "0" : `${Math.round(v / 1000)}k`);

const Y_STEP = 50000; // y-axis gridline interval (per request)

/** Bucket date for a transaction: prefer paid_at (when the money actually
 *  moved), otherwise fall back to created_at. */
const bucketDate = (paidAt: string | null, createdAt: string | null) => paidAt ?? createdAt;

const FinanceChart = () => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [salaries, setSalaries] = useState<PayrollRow[]>([]);
  const [opExpenses, setOpExpenses] = useState<ExpenseRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Which line's tooltip to isolate, and which line was clicked to drill.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [drill, setDrill] = useState<"income" | "expense" | null>(null);

  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed; only show Jan..this

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.schoolId) { setLoading(false); return; }
      setLoading(true);

      const [feeRes, payRes, expRes] = await Promise.all([
        supabase
          .from("student_fees")
          .select("paid_amount, paid_at, created_at, fee_type, student_id")
          .eq("school_id", user.schoolId)
          .gt("paid_amount", 0),
        supabase
          .from("payroll")
          .select("net_salary, paid_at, created_at, employee_id")
          .eq("school_id", user.schoolId)
          .eq("status", "paid"),
        supabase
          .from("expenses")
          .select("amount, paid_at, created_at, title, category")
          .eq("school_id", user.schoolId)
          .eq("status", "paid"),
      ]);

      const feeRows = (feeRes.data as FeeRow[]) || [];
      const payRows = (payRes.data as PayrollRow[]) || [];
      setFees(feeRows);
      setSalaries(payRows);
      setOpExpenses((expRes.data as ExpenseRow[]) || []);

      // Resolve student/employee names for the drill-down labels in one query.
      const ids = Array.from(new Set(
        [...feeRows.map((f) => f.student_id), ...payRows.map((p) => p.employee_id)].filter(Boolean) as string[],
      ));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, first_name, last_name").in("id", ids);
        const map: Record<string, string> = {};
        (profs as { id: string; first_name: string; last_name: string }[] | null)?.forEach((p) => {
          map[p.id] = `${p.first_name} ${p.last_name}`.trim();
        });
        setNames(map);
      }
      setLoading(false);
    };
    load();
  }, [user?.schoolId, year]);

  const months = useMemo(() => MONTH_KEYS.map((k) => t(k)), [t]);

  const chartData = useMemo(() => {
    const incomeM = new Array(12).fill(0);
    const expenseM = new Array(12).fill(0);
    fees.forEach((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      if (!d) return;
      const dt = new Date(d);
      if (dt.getFullYear() !== year) return;
      incomeM[dt.getMonth()] += r.paid_amount ?? 0;
    });
    salaries.forEach((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      if (!d) return;
      const dt = new Date(d);
      if (dt.getFullYear() !== year) return;
      expenseM[dt.getMonth()] += r.net_salary ?? 0;
    });
    opExpenses.forEach((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      if (!d) return;
      const dt = new Date(d);
      if (dt.getFullYear() !== year) return;
      expenseM[dt.getMonth()] += r.amount ?? 0;
    });
    // Running totals, then cut off at the current month so the chart never
    // projects flat lines into months that haven't happened yet.
    let cumIncome = 0;
    let cumExpense = 0;
    return months
      .map((name, i) => {
        cumIncome += incomeM[i];
        cumExpense += expenseM[i];
        return { name, income: cumIncome, expense: cumExpense, balance: cumIncome - cumExpense };
      })
      .slice(0, currentMonth + 1);
  }, [fees, salaries, opExpenses, year, months, currentMonth]);

  // Y-axis domain + ticks at a fixed 50k interval (negative-safe).
  const yConfig = useMemo(() => {
    const vals = chartData.flatMap((d) => [d.income, d.expense, d.balance]);
    let min = Math.min(0, ...(vals.length ? vals : [0]));
    let max = Math.max(0, ...(vals.length ? vals : [0]));
    min = Math.floor(min / Y_STEP) * Y_STEP;
    max = Math.ceil(max / Y_STEP) * Y_STEP;
    if (max === min) max = min + Y_STEP;
    const ticks: number[] = [];
    for (let v = min; v <= max; v += Y_STEP) ticks.push(v);
    return { domain: [min, max] as [number, number], ticks };
  }, [chartData]);

  const totals = useMemo(() => {
    const income = fees.reduce((s, r) => s + (r.paid_amount ?? 0), 0);
    const expense =
      salaries.reduce((s, r) => s + (r.net_salary ?? 0), 0) +
      opExpenses.reduce((s, r) => s + (r.amount ?? 0), 0);
    return { income, expense, net: income - expense };
  }, [fees, salaries, opExpenses]);

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US",
      { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  const nameOf = (id: string | null) => (id && names[id]) || "—";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Last-3 transactions per line for the click drill-down.
  const incomeTx = useMemo<Tx[]>(() => fees
    .map((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      return d ? { ts: +new Date(d), date: fmtDate(d), amount: r.paid_amount ?? 0,
        label: `${cap(r.fee_type ?? "fee")} · ${nameOf(r.student_id)}` } : null;
    })
    .filter((x): x is Tx => x !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fees, names, locale]);

  const expenseTx = useMemo<Tx[]>(() => {
    const fromPayroll: Tx[] = salaries.map((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      return d ? { ts: +new Date(d), date: fmtDate(d), amount: r.net_salary ?? 0,
        label: `${t("fin.salaryLabel")} · ${nameOf(r.employee_id)}` } : null;
    }).filter((x): x is Tx => x !== null);
    const fromExpenses: Tx[] = opExpenses.map((r) => {
      const d = bucketDate(r.paid_at, r.created_at);
      return d ? { ts: +new Date(d), date: fmtDate(d), amount: r.amount ?? 0,
        label: r.title ?? cap(r.category ?? "expense") } : null;
    }).filter((x): x is Tx => x !== null);
    return [...fromPayroll, ...fromExpenses].sort((a, b) => b.ts - a.ts).slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaries, opExpenses, names, locale, t]);

  const drillList = drill === "income" ? incomeTx : drill === "expense" ? expenseTx : [];

  // Tooltip that shows ONLY the hovered line (falls back to all when the
  // cursor isn't on a specific line).
  interface TipProps { active?: boolean; label?: string | number;
    payload?: { dataKey?: string | number; name?: string; value?: number; color?: string }[] }
  const renderTooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const entries = activeKey ? payload.filter((p) => p.dataKey === activeKey) : payload;
    if (!entries.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2 text-xs">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        {entries.map((p) => (
          <p key={String(p.dataKey)} style={{ color: p.color }}>{p.name} : {fmtMoney(p.value ?? 0)}</p>
        ))}
      </div>
    );
  };

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

        {/* Click drill-down: last 3 transactions for income / expense */}
        {drill && (
          <div className="absolute top-1 right-1 z-10 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-700">
                {drill === "income" ? t("fin.income") : t("fin.expense")} · {t("fin.lastThreeTransactions")}
              </span>
              <button onClick={() => setDrill(null)} className="text-gray-400 hover:text-gray-700 leading-none text-base">×</button>
            </div>
            {drillList.length === 0 ? (
              <p className="text-gray-400">{t("fin.noTransactions")}</p>
            ) : (
              <ul>
                {drillList.map((tx, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{tx.label}</p>
                      <p className="text-gray-400">{tx.date}</p>
                    </div>
                    <span className={`font-semibold whitespace-nowrap ${drill === "income" ? "text-green-600" : "text-red-600"}`}>
                      {fmtMoney(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            onMouseLeave={() => setActiveKey(null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
            <XAxis dataKey="name" axisLine={false} tick={{ fill: "#9ca3af" }} tickLine={false} tickMargin={10} />
            <YAxis
              axisLine={false}
              tick={{ fill: "#9ca3af" }}
              tickLine={false}
              tickMargin={20}
              domain={yConfig.domain}
              ticks={yConfig.ticks}
              tickFormatter={fmtK}
              allowDecimals={false}
            />
            <Tooltip content={renderTooltip} />
            <Legend align="center" verticalAlign="top" wrapperStyle={{ paddingTop: "10px", paddingBottom: "20px" }} />
            <Line type="monotone" dataKey="income" name={t("fin.income")} stroke="#3a6d9a" strokeWidth={2}
              dot={{ r: 2 }} className="cursor-pointer"
              activeDot={{ r: 5, onMouseEnter: () => setActiveKey("income") }}
              onMouseEnter={() => setActiveKey("income")}
              onClick={() => setDrill("income")} />
            <Line type="monotone" dataKey="expense" name={t("fin.expense")} stroke="#ef4444" strokeWidth={2}
              dot={{ r: 2 }} className="cursor-pointer"
              activeDot={{ r: 5, onMouseEnter: () => setActiveKey("expense") }}
              onMouseEnter={() => setActiveKey("expense")}
              onClick={() => setDrill("expense")} />
            <Line type="monotone" dataKey="balance" name={t("fin.balance")} stroke="#16a34a" strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5, onMouseEnter: () => setActiveKey("balance") }}
              onMouseEnter={() => setActiveKey("balance")} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{t("fin.drillHint")}</p>
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
