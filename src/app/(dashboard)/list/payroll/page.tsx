"use client";

// Payroll register — pay staff for a selected month.
//   • Two tables: Teachers and Employees (employees = role 'employee' +
//     'school_admin'), each row showing the person's monthly salary and
//     paid/unpaid status FOR THE SELECTED MONTH.
//   • "Mark as paid" inserts a payroll row (status = 'paid', net = salary,
//     pay_period = month). The finance dashboard already sums paid payroll as
//     an expense and deducts it from the running balance, so paying here flows
//     straight through to the dashboard. "Undo" deletes that month's payment
//     (removing the expense). The existing detailed payroll form stays for
//     adjustments via "Add / adjust record".

import { useCallback, useEffect, useMemo, useState } from "react";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";

interface Person {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  job_title: string | null;
  salary: number | null;
}
interface PaidInfo { id: string; net_salary: number; paid_at: string | null }

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const PayrollPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();
  const canEdit = user?.role === "school_admin" || user?.role === "platform_admin";

  const [month, setMonth] = useState(currentMonth());
  const [people, setPeople] = useState<Person[]>([]);
  const [paid, setPaid] = useState<Map<string, PaidInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    setLoading(true);
    const [peopleRes, payRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, role, job_title, salary")
        .eq("school_id", user.schoolId)
        .in("role", ["teacher", "employee", "school_admin"])
        .eq("is_active", true)
        .order("last_name"),
      supabase
        .from("payroll")
        .select("id, employee_id, net_salary, paid_at, status")
        .eq("school_id", user.schoolId)
        .eq("pay_period", month)
        .eq("status", "paid"),
    ]);
    setPeople((peopleRes.data as Person[]) ?? []);
    const map = new Map<string, PaidInfo>();
    ((payRes.data as { id: string; employee_id: string; net_salary: number; paid_at: string | null }[]) ?? [])
      .forEach((r) => map.set(r.employee_id, { id: r.id, net_salary: r.net_salary, paid_at: r.paid_at }));
    setPaid(map);
    setLoading(false);
  }, [supabase, user?.schoolId, month]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (p: Person) => {
    if (!supabase || !user || p.salary == null || busy) return;
    setBusy(p.id);
    const amount = Math.round(p.salary);
    await supabase.from("payroll").insert({
      school_id: user.schoolId,
      employee_id: p.id,
      base_salary: amount,
      deductions: 0,
      bonuses: 0,
      net_salary: amount,
      pay_period: month,
      status: "paid",
      paid_at: new Date().toISOString().slice(0, 10),
    });
    setBusy(null);
    load();
  };

  const undoPaid = async (p: Person) => {
    if (!supabase || !user || busy) return;
    setBusy(p.id);
    await supabase
      .from("payroll")
      .delete()
      .eq("school_id", user.schoolId)
      .eq("employee_id", p.id)
      .eq("pay_period", month)
      .eq("status", "paid");
    setBusy(null);
    load();
  };

  const teachers = useMemo(() => people.filter((p) => p.role === "teacher"), [people]);
  const staff = useMemo(() => people.filter((p) => p.role === "employee" || p.role === "school_admin"), [people]);

  // Summary across everyone for the selected month.
  const summary = useMemo(() => {
    const totalPayroll = people.reduce((s, p) => s + (p.salary ?? 0), 0);
    let paidTotal = 0;
    paid.forEach((v) => { paidTotal += v.net_salary; });
    const outstanding = people.reduce((s, p) => s + (paid.has(p.id) ? 0 : (p.salary ?? 0)), 0);
    return { totalPayroll, paidTotal, outstanding, headcount: people.length, paidCount: paid.size };
  }, [people, paid]);

  if (!canEdit) {
    return (
      <div className="bg-white p-6 rounded-md flex-1 m-4 mt-0 text-sm text-gray-500 text-center">
        {t("perf.adminOnly")}
      </div>
    );
  }

  const roleLabel = (p: Person) =>
    p.job_title || (p.role === "school_admin" ? "School admin" : p.role === "teacher" ? "Teacher" : "Employee");

  const PeopleTable = ({ title, rows }: { title: string; rows: Person[] }) => (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">{title} <span className="text-gray-400 font-normal">({rows.length})</span></h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{t("fin.noStaff")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
              <tr>
                <th className="text-left py-2">{t("fin.colEmployee")}</th>
                <th className="text-left py-2">{t("fin.colRole")}</th>
                <th className="text-right py-2">{t("fin.colSalary")}</th>
                <th className="text-center py-2">{t("fin.colStatus")}</th>
                <th className="text-right py-2">{t("fin.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const info = paid.get(p.id);
                return (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">{p.first_name} {p.last_name}</td>
                    <td className="py-2.5 text-gray-500 capitalize">{roleLabel(p)}</td>
                    <td className="py-2.5 text-right text-gray-700">{p.salary == null ? "—" : money(p.salary)}</td>
                    <td className="py-2.5 text-center">
                      {info ? (
                        <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                          {t("fin.paidOnDate", { date: info.paid_at ? new Date(info.paid_at).toLocaleDateString() : "" })}
                        </span>
                      ) : (
                        <span className="text-[11px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">
                          {t("fin.unpaidLabel")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {info ? (
                        <button
                          onClick={() => undoPaid(p)}
                          disabled={busy === p.id}
                          className="text-[11px] bg-gray-100 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                          {t("fin.undoPay")}
                        </button>
                      ) : p.salary == null ? (
                        <span className="text-[11px] text-gray-400">{t("fin.setSalaryFirst")}</span>
                      ) : (
                        <button
                          onClick={() => markPaid(p)}
                          disabled={busy === p.id}
                          className="text-[11px] bg-emerald-600 text-white px-2.5 py-1 rounded hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy === p.id ? t("fin.paying") : t("fin.markPaid")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("fin.titlePayroll")}</h1>
          <p className="text-xs text-gray-500 max-w-xl">{t("fin.payrollSubtitle")}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[11px] text-gray-500 block">{t("fin.payMonth")}</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <FormModal table="payroll" type="create" />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t("fin.kpiTotalPayroll")} value={money(summary.totalPayroll)} tone="bg-slate-50 text-slate-800" />
        <Kpi label={t("fin.kpiPaid")} value={money(summary.paidTotal)} tone="bg-emerald-50 text-emerald-700" />
        <Kpi label={t("fin.kpiOutstanding")} value={money(summary.outstanding)} tone="bg-amber-50 text-amber-700" />
        <Kpi label={t("fin.kpiHeadcount")} value={`${summary.paidCount}/${summary.headcount}`} tone="bg-sky-50 text-sky-700" />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">{t("fin.loadingPayroll")}</div>
      ) : (
        <>
          <PeopleTable title={t("fin.teachersTable")} rows={teachers} />
          <PeopleTable title={t("fin.staffTable")} rows={staff} />
        </>
      )}
    </div>
  );
};

const Kpi = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <div className={`rounded-2xl p-3.5 border border-black/[0.03] ${tone.split(" ")[0]}`}>
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-2xl font-bold mt-1 truncate ${tone.split(" ").slice(1).join(" ")}`}>{value}</p>
  </div>
);

export default PayrollPage;
