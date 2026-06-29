"use client";

// Public, login-free payslip page reached from a shared WhatsApp / email
// link. The token in the URL is the credential: it loads exactly one
// payslip (via the get_payslip_share RPC), shows it, and lets the employee
// e-sign and submit it back (acknowledge_payslip_by_token RPC). Once signed
// it shows a green tick. The payslip can also be downloaded as an A4 PDF.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import SignaturePad from "@/components/SignaturePad";
import { downloadPayslips, type PayslipData, type PayslipLabels } from "@/lib/payslip";

interface Share {
  id: string;
  pay_period: string;
  net_amount: number;
  status: "issued" | "acknowledged";
  admin_signature: string | null;
  employee_signature: string | null;
  employee_signed_at: string | null;
  employee_name: string;
  role: string;
  school_name: string;
  school_address: string | null;
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const SignPayslipPage = () => {
  const { t, locale } = useI18n();
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token as string);
  const supabase = createClient();

  const [slip, setSlip] = useState<Share | null>(null);
  const [loading, setLoading] = useState(true);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !token) { setLoading(false); setError(true); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc("get_payslip_share", { p_token: token });
    const row = (data as Share[] | null)?.[0] ?? null;
    setSlip(row);
    setError(!!err || !row);
    setLoading(false);
  }, [supabase, token]);

  useEffect(() => { load(); }, [load]);

  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "ar" ? "ar" : "en-US", { month: "long", year: "numeric" })
      .format(new Date(`${m}-01T00:00:00`));

  const pdfLabels: PayslipLabels = useMemo(() => ({
    payslip: t("fin.payslip"), payPeriod: t("fin.pdfPayPeriod"), employee: t("fin.pdfEmployee"),
    role: t("fin.colRole"), netPay: t("fin.pdfNetPay"), status: t("fin.pdfStatus"),
    paid: t("fin.statusPaid"), unpaid: t("fin.unpaidLabel"), paidOn: t("fin.pdfPaidOn"),
    acknowledged: t("fin.pdfAcknowledged"), employeeSignature: t("fin.pdfEmployeeSignature"),
    authorizedSignature: t("fin.pdfAuthorizedSignature"), generatedOn: t("fin.pdfGeneratedOn"),
  }), [t]);

  const slipData = (s: Share): PayslipData => ({
    employeeName: s.employee_name,
    role: s.role,
    payMonthLabel: monthLabel(s.pay_period),
    netAmount: s.net_amount,
    status: "paid",
    paidOn: null,
    acknowledged: s.status === "acknowledged",
    adminSignature: s.admin_signature,
    employeeSignature: s.employee_signature,
  });

  const school = (s: Share) => ({ name: s.school_name, address: s.school_address });

  const submit = async () => {
    if (!supabase || !slip || !sig || busy) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("acknowledge_payslip_by_token", { p_token: token, p_signature: sig });
    setBusy(false);
    if (!err) load();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Link Scolaire" className="h-10 w-auto" />
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-sm text-gray-400">
            {t("fin.loadingPayroll")}
          </div>
        ) : error || !slip ? (
          <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
            <p className="text-sm text-gray-600">{t("fin.shareNotFound")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">{slip.school_name}</p>
                  {slip.school_address && <p className="text-xs text-gray-500">{slip.school_address}</p>}
                </div>
                <span className="text-sm font-bold tracking-wide text-[#3a6d9a]">{t("fin.payslip").toUpperCase()}</span>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">{t("fin.myPayslipsSub")}</p>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400 text-xs block">{t("fin.pdfEmployee")}</span>
                  <span className="font-medium text-gray-800">{slip.employee_name}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">{t("fin.colRole")}</span>
                  <span className="text-gray-800">{slip.role}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">{t("fin.payMonth")}</span>
                  <span className="text-gray-800">{monthLabel(slip.pay_period)}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">{t("fin.pdfNetPay")}</span>
                  <span className="font-semibold text-gray-900">{money(slip.net_amount)}</span>
                </div>
              </div>

              {/* Net pay highlight */}
              <div className="rounded-xl bg-gray-50 border px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">{t("fin.pdfNetPay")}</span>
                <span className="text-2xl font-bold text-gray-900">{money(slip.net_amount)}</span>
              </div>

              {/* Authorized signature */}
              {slip.admin_signature && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">{t("fin.pdfAuthorizedSignature")}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slip.admin_signature} alt="" className="h-12 border border-gray-200 rounded bg-white" />
                </div>
              )}

              {/* Acknowledgement */}
              {slip.status === "acknowledged" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">✔</span>
                    {t("fin.acknowledgedOn", { date: slip.employee_signed_at ? new Date(slip.employee_signed_at).toLocaleDateString() : "" })}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">{t("fin.acknowledgedThanks")}</p>
                  {slip.employee_signature && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={slip.employee_signature} alt="" className="h-12 mt-2 border border-emerald-200 rounded bg-white" />
                  )}
                </div>
              ) : (
                <div className="border-t pt-4">
                  <p className="text-xs font-semibold text-gray-600 mb-1">{t("fin.signToAcknowledge")}</p>
                  <SignaturePad onChange={setSig} clearLabel={t("fin.cancelEdit")} />
                  <button
                    onClick={submit}
                    disabled={!sig || busy}
                    className="mt-2 w-full bg-emerald-600 text-white text-sm py-2.5 rounded-md hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? t("fin.submitting") : t("fin.submitSig")}
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => downloadPayslips(school(slip), [slipData(slip)], pdfLabels, new Date().toLocaleDateString(), `payslip-${slip.pay_period}.pdf`)}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200"
                >
                  {t("fin.downloadPdf")}
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">Link Scolaire</p>
      </div>
    </div>
  );
};

export default SignPayslipPage;
