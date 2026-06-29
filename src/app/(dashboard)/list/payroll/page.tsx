"use client";

// Payroll register — pay staff for a selected month, set salaries inline, and
// print payslips.
//   • Two tables: Teachers and Employees (role 'employee' + 'school_admin').
//   • Checkbox per row + select-all per table → a bulk bar to "Process pay"
//     (mark all selected unpaid-with-salary as paid for the month) or
//     "Print payslips" (one A4 page per selected person).
//   • Per-row: Mark as paid / Undo, an inline "Set salary" editor (writes to
//     the employee's profile), and a single-payslip print.
//   • "Mark as paid" inserts a payroll row (status='paid'); the finance
//     dashboard already counts paid payroll as an expense and deducts it.

import { useCallback, useEffect, useMemo, useState } from "react";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import { printPayslips, type PayslipData } from "@/lib/payslip";
import AdminPayslipModal, { type ExistingPayslip } from "@/components/payroll/AdminPayslipModal";

interface Person {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  job_title: string | null;
  salary: number | null;
  phone: string | null;
  email: string | null;
}
interface PaidInfo { id: string; net_salary: number; paid_at: string | null }

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const PayrollPage = () => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();
  const canEdit = user?.role === "school_admin" || user?.role === "platform_admin";

  const [month, setMonth] = useState(currentMonth());
  const [people, setPeople] = useState<Person[]>([]);
  const [paid, setPaid] = useState<Map<string, PaidInfo>>(new Map());
  const [school, setSchool] = useState<{ name: string; address: string | null }>({ name: "", address: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [payslips, setPayslips] = useState<Map<string, ExistingPayslip>>(new Map());
  const [modalPerson, setModalPerson] = useState<Person | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    setLoading(true);
    const [peopleRes, payRes, schoolRes, slipRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, role, job_title, salary, phone, email")
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
      supabase.from("schools").select("name, address, city, state, country").eq("id", user.schoolId).single(),
      supabase
        .from("payslips")
        .select("id, employee_id, status, admin_signature, employee_signature, employee_signed_at, share_token")
        .eq("school_id", user.schoolId)
        .eq("pay_period", month),
    ]);
    setPeople((peopleRes.data as Person[]) ?? []);
    const map = new Map<string, PaidInfo>();
    ((payRes.data as { id: string; employee_id: string; net_salary: number; paid_at: string | null }[]) ?? [])
      .forEach((r) => map.set(r.employee_id, { id: r.id, net_salary: r.net_salary, paid_at: r.paid_at }));
    setPaid(map);
    const slipMap = new Map<string, ExistingPayslip>();
    ((slipRes.data as (ExistingPayslip & { employee_id: string })[]) ?? [])
      .forEach((r) => slipMap.set(r.employee_id, r));
    setPayslips(slipMap);
    const s = schoolRes.data as { name: string; address: string | null; city: string | null; state: string | null; country: string | null } | null;
    setSchool({
      name: s?.name ?? user.schoolName,
      address: [s?.address, s?.city, s?.state, s?.country].filter(Boolean).join(", ") || null,
    });
    setSelected(new Set());
    setLoading(false);
  }, [supabase, user?.schoolId, month]);

  useEffect(() => { load(); }, [load]);

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const payRow = (p: Person) => ({
    school_id: user!.schoolId,
    employee_id: p.id,
    base_salary: Math.round(p.salary ?? 0),
    deductions: 0,
    bonuses: 0,
    net_salary: Math.round(p.salary ?? 0),
    pay_period: month,
    status: "paid" as const,
    paid_at: todayStr(),
  });

  const markPaid = async (p: Person) => {
    if (!supabase || !user || p.salary == null || busy) return;
    setBusy(p.id);
    await supabase.from("payroll").insert(payRow(p));
    setBusy(null);
    load();
  };

  const undoPaid = async (p: Person) => {
    if (!supabase || !user || busy) return;
    setBusy(p.id);
    await supabase.from("payroll").delete()
      .eq("school_id", user.schoolId).eq("employee_id", p.id).eq("pay_period", month).eq("status", "paid");
    setBusy(null);
    load();
  };

  const processSelectedPay = async () => {
    if (!supabase || !user) return;
    const targets = people.filter((p) => selected.has(p.id) && !paid.has(p.id) && p.salary != null);
    if (targets.length === 0) return;
    setBusy("bulk");
    await Promise.all(targets.map((p) => supabase.from("payroll").insert(payRow(p))));
    setBusy(null);
    load();
  };

  const saveSalary = async () => {
    if (!supabase || !editing) return;
    setBusy(editing.id);
    const value = editing.value ? Number(editing.value) : null;
    await supabase.from("profiles").update({ salary: value }).eq("id", editing.id);
    setPeople((prev) => prev.map((p) => (p.id === editing.id ? { ...p, salary: value } : p)));
    setEditing(null);
    setBusy(null);
  };

  // ── Selection ───────────────────────────────────────────────────────
  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => { const n = new Set(prev); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });

  const roleLabel = (p: Person) =>
    p.job_title || (p.role === "school_admin" ? "School admin" : p.role === "teacher" ? "Teacher" : "Employee");

  const monthLabelFull = (m: string) =>
    new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US", { month: "long", year: "numeric" })
      .format(new Date(`${m}-01T00:00:00`));

  const payslipLabels = useMemo(() => ({
    payslip: t("fin.payslip"), payPeriod: t("fin.pdfPayPeriod"), employee: t("fin.pdfEmployee"),
    role: t("fin.colRole"), netPay: t("fin.pdfNetPay"), status: t("fin.pdfStatus"),
    paid: t("fin.statusPaid"), unpaid: t("fin.unpaidLabel"), paidOn: t("fin.pdfPaidOn"),
    acknowledged: t("fin.pdfAcknowledged"),
    employeeSignature: t("fin.pdfEmployeeSignature"), authorizedSignature: t("fin.pdfAuthorizedSignature"),
    generatedOn: t("fin.pdfGeneratedOn"),
  }), [t]);

  const payslipFor = (p: Person): PayslipData => {
    const info = paid.get(p.id);
    const slip = payslips.get(p.id);
    return {
      employeeName: `${p.first_name} ${p.last_name}`.trim(),
      role: roleLabel(p),
      payMonthLabel: monthLabelFull(month),
      netAmount: info ? info.net_salary : (p.salary ?? 0),
      status: info ? "paid" : "unpaid",
      paidOn: info?.paid_at ? new Date(info.paid_at).toLocaleDateString() : null,
      acknowledged: slip?.status === "acknowledged",
      adminSignature: slip?.admin_signature ?? null,
      employeeSignature: slip?.employee_signature ?? null,
    };
  };

  const printFor = (rows: Person[]) =>
    printPayslips(school, rows.map(payslipFor), payslipLabels, new Date().toLocaleDateString());

  const teachers = useMemo(() => people.filter((p) => p.role === "teacher"), [people]);
  const staff = useMemo(() => people.filter((p) => p.role === "employee" || p.role === "school_admin"), [people]);

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

  // Rendered by direct call (not <PeopleTable/>) so re-renders on each
  // keystroke don't remount the subtree and drop the salary input's focus.
  const peopleTable = (title: string, rows: Person[]) => {
    const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    return (
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">
          {title} <span className="text-gray-400 font-normal">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t("fin.noStaff")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="py-2 w-8 text-center">
                    <input
                      type="checkbox" aria-label="Select all"
                      checked={allSelected}
                      onChange={(e) => setMany(rows.map((r) => r.id), e.target.checked)}
                    />
                  </th>
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
                  const isEditing = editing?.id === p.id;
                  return (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="py-2.5 text-center">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Select ${p.first_name}`} />
                      </td>
                      <td className="py-2.5 font-medium text-gray-800">{p.first_name} {p.last_name}</td>
                      <td className="py-2.5 text-gray-500 capitalize">{roleLabel(p)}</td>
                      <td className="py-2.5 text-right">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number" autoFocus
                              value={editing!.value}
                              onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                              className="w-24 text-right border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                            <button onClick={saveSalary} disabled={busy === p.id} className="text-[11px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">{t("fin.saveSalary")}</button>
                            <button onClick={() => setEditing(null)} className="text-[11px] text-gray-500 px-1">{t("fin.cancelEdit")}</button>
                          </span>
                        ) : p.salary == null ? (
                          <button onClick={() => setEditing({ id: p.id, value: "" })} className="text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded hover:bg-blue-100">
                            {t("fin.setSalary")}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-2 justify-end">
                            <span className="text-gray-700">{money(p.salary)}</span>
                            <button onClick={() => setEditing({ id: p.id, value: String(p.salary) })} className="text-[11px] text-blue-600 hover:underline">{t("fin.editSalary")}</button>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        {info ? (
                          <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                            {t("fin.paidOnDate", { date: info.paid_at ? new Date(info.paid_at).toLocaleDateString() : "" })}
                          </span>
                        ) : (
                          <span className="text-[11px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">{t("fin.unpaidLabel")}</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {info ? (
                            <button onClick={() => undoPaid(p)} disabled={busy === p.id} className="text-[11px] bg-gray-100 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-200 disabled:opacity-50">{t("fin.undoPay")}</button>
                          ) : p.salary == null ? (
                            <span className="text-[11px] text-gray-400">{t("fin.setSalaryFirst")}</span>
                          ) : (
                            <button onClick={() => markPaid(p)} disabled={busy === p.id} className="text-[11px] bg-emerald-600 text-white px-2.5 py-1 rounded hover:bg-emerald-700 disabled:opacity-50">
                              {busy === p.id ? t("fin.paying") : t("fin.markPaid")}
                            </button>
                          )}
                          {payslips.get(p.id)?.status === "acknowledged" && (
                            <span title={t("fin.acknowledgedLabel")} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px]">✔</span>
                          )}
                          <button onClick={() => setModalPerson(p)} className="text-[11px] bg-gray-100 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-200">{t("fin.payslip")}</button>
                        </div>
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
  };

  const selectedRows = people.filter((p) => selected.has(p.id));
  const payableCount = selectedRows.filter((p) => !paid.has(p.id) && p.salary != null).length;

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
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200" />
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span className="text-xs text-blue-900 font-medium">{t("fin.selectedCount", { n: selected.size })}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={processSelectedPay} disabled={busy === "bulk" || payableCount === 0} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 disabled:opacity-50">
              {busy === "bulk" ? t("fin.paying") : `${t("fin.processPay")} (${payableCount})`}
            </button>
            <button onClick={() => printFor(selectedRows)} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-gray-900">
              {`${t("fin.printPayslips")} (${selected.size})`}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-700 px-2 hover:underline">{t("fin.clearSelection")}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">{t("fin.loadingPayroll")}</div>
      ) : (
        <>
          {peopleTable(t("fin.teachersTable"), teachers)}
          {peopleTable(t("fin.staffTable"), staff)}
        </>
      )}

      {modalPerson && (() => {
        const p = modalPerson;
        const info = paid.get(p.id);
        return (
          <AdminPayslipModal
            person={{ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), role: roleLabel(p), phone: p.phone, email: p.email }}
            month={month}
            monthLabel={monthLabelFull(month)}
            netAmount={info ? info.net_salary : (p.salary ?? 0)}
            paid={!!info}
            paidOn={info?.paid_at ? new Date(info.paid_at).toLocaleDateString() : null}
            school={school}
            payslip={payslips.get(p.id) ?? null}
            pdfLabels={payslipLabels}
            onClose={() => setModalPerson(null)}
            onChanged={() => load()}
          />
        );
      })()}
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
