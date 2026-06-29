"use client";

// Employee / teacher view of their own payslips. Each issued payslip can be
// e-signed to acknowledge the pay (acknowledge_payslip RPC). Once signed it
// shows a green tick. Payslips can be printed / downloaded as A4 PDF.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import SignaturePad from "@/components/SignaturePad";
import { printPayslips, downloadPayslips, type PayslipData, type PayslipLabels } from "@/lib/payslip";

interface Slip {
  id: string;
  pay_period: string;
  net_amount: number;
  admin_signature: string | null;
  employee_signature: string | null;
  employee_signed_at: string | null;
  status: "issued" | "acknowledged";
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const PayslipsPage = () => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();

  const [slips, setSlips] = useState<Slip[]>([]);
  const [school, setSchool] = useState<{ name: string; address: string | null }>({ name: "", address: null });
  const [loading, setLoading] = useState(true);
  const [sigById, setSigById] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user?.profileId) { setLoading(false); return; }
    setLoading(true);
    const [slipRes, schoolRes] = await Promise.all([
      supabase
        .from("payslips")
        .select("id, pay_period, net_amount, admin_signature, employee_signature, employee_signed_at, status")
        .eq("employee_id", user.profileId)
        .order("pay_period", { ascending: false }),
      supabase.from("schools").select("name, address, city, state, country").eq("id", user.schoolId).single(),
    ]);
    setSlips((slipRes.data as Slip[]) ?? []);
    const s = schoolRes.data as { name: string; address: string | null; city: string | null; state: string | null; country: string | null } | null;
    setSchool({ name: s?.name ?? user.schoolName, address: [s?.address, s?.city, s?.state, s?.country].filter(Boolean).join(", ") || null });
    setLoading(false);
  }, [supabase, user?.profileId, user?.schoolId]);

  useEffect(() => { load(); }, [load]);

  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US", { month: "long", year: "numeric" })
      .format(new Date(`${m}-01T00:00:00`));

  const roleText = user?.role === "teacher" ? "Teacher" : "Employee";

  const pdfLabels: PayslipLabels = useMemo(() => ({
    payslip: t("fin.payslip"), payPeriod: t("fin.pdfPayPeriod"), employee: t("fin.pdfEmployee"),
    role: t("fin.colRole"), netPay: t("fin.pdfNetPay"), status: t("fin.pdfStatus"),
    paid: t("fin.statusPaid"), unpaid: t("fin.unpaidLabel"), paidOn: t("fin.pdfPaidOn"),
    acknowledged: t("fin.pdfAcknowledged"), employeeSignature: t("fin.pdfEmployeeSignature"),
    authorizedSignature: t("fin.pdfAuthorizedSignature"), generatedOn: t("fin.pdfGeneratedOn"),
  }), [t]);

  const slipData = (s: Slip): PayslipData => ({
    employeeName: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
    role: roleText,
    payMonthLabel: monthLabel(s.pay_period),
    netAmount: s.net_amount,
    status: "paid",
    paidOn: null,
    acknowledged: s.status === "acknowledged",
    adminSignature: s.admin_signature,
    employeeSignature: s.employee_signature,
  });

  const acknowledge = async (s: Slip) => {
    const sig = sigById[s.id];
    if (!supabase || !sig || busy) return;
    setBusy(s.id);
    await supabase.rpc("acknowledge_payslip", { p_payslip_id: s.id, p_signature: sig });
    setBusy(null);
    load();
  };

  if (loading) {
    return <div className="p-4"><div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">{t("fin.loadingPayroll")}</div></div>;
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t("fin.myPayslips")}</h1>
        <p className="text-xs text-gray-500">{t("fin.myPayslipsSub")}</p>
      </div>

      {slips.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">{t("fin.noPayslipsYet")}</div>
      ) : (
        slips.map((s) => {
          const acknowledged = s.status === "acknowledged";
          return (
            <div key={s.id} className="bg-white rounded-xl border shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-800">{monthLabel(s.pay_period)}</p>
                  <p className="text-2xl font-bold text-gray-900">{money(s.net_amount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {acknowledged ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">✔</span>
                      {t("fin.acknowledgedLabel")}
                    </span>
                  ) : (
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded-full">{t("fin.pendingYourSig")}</span>
                  )}
                  <button onClick={() => downloadPayslips(school, [slipData(s)], pdfLabels, new Date().toLocaleDateString(), `payslip-${s.pay_period}.pdf`)} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200">{t("fin.downloadPdf")}</button>
                  <button onClick={() => printPayslips(school, [slipData(s)], pdfLabels, new Date().toLocaleDateString())} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-gray-900">{t("fin.printPdf")}</button>
                </div>
              </div>

              {acknowledged ? (
                <p className="mt-3 text-xs text-emerald-700">{t("fin.acknowledgedThanks")}</p>
              ) : (
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">{t("fin.signToAcknowledge")}</p>
                  <div className="max-w-md">
                    <SignaturePad onChange={(d) => setSigById((m) => ({ ...m, [s.id]: d }))} clearLabel={t("fin.cancelEdit")} />
                    <button
                      onClick={() => acknowledge(s)}
                      disabled={!sigById[s.id] || busy === s.id}
                      className="mt-2 bg-emerald-600 text-white text-sm px-4 py-2 rounded-md hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === s.id ? t("fin.submitting") : t("fin.submitSig")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default PayslipsPage;
