"use client";

// Admin payslip dialog: review the payslip, e-sign + issue it, share the
// review/sign link with the employee via WhatsApp or email, watch the
// acknowledgement status, and print / download the A4 PDF.

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import SignaturePad from "@/components/SignaturePad";
import { printPayslips, downloadPayslips, type PayslipLabels, type PayslipData } from "@/lib/payslip";

export interface ExistingPayslip {
  id: string;
  status: "issued" | "acknowledged";
  admin_signature: string | null;
  employee_signature: string | null;
  employee_signed_at: string | null;
  share_token: string | null;
}

interface Props {
  person: { id: string; name: string; role: string; phone: string | null; email: string | null };
  month: string;
  monthLabel: string;
  netAmount: number;
  paid: boolean;
  paidOn: string | null;
  school: { name: string; address: string | null };
  payslip: ExistingPayslip | null;
  pdfLabels: PayslipLabels;
  onClose: () => void;
  onChanged: () => void;
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const AdminPayslipModal = ({
  person, month, monthLabel, netAmount, paid, paidOn, school, payslip, pdfLabels, onClose, onChanged,
}: Props) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();
  const [adminSig, setAdminSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const issued = !!payslip?.admin_signature;
  const acknowledged = payslip?.status === "acknowledged";

  const slipData = (): PayslipData => ({
    employeeName: person.name,
    role: person.role,
    payMonthLabel: monthLabel,
    netAmount,
    status: paid ? "paid" : "unpaid",
    paidOn,
    acknowledged,
    adminSignature: payslip?.admin_signature ?? adminSig,
    employeeSignature: payslip?.employee_signature ?? null,
  });

  const signAndIssue = async () => {
    if (!supabase || !user || !adminSig) return;
    setSaving(true);
    await supabase.from("payslips").upsert(
      {
        school_id: user.schoolId,
        employee_id: person.id,
        pay_period: month,
        net_amount: netAmount,
        admin_signature: adminSig,
        admin_signed_at: new Date().toISOString(),
        admin_signed_by: user.profileId,
        status: "issued",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,pay_period" },
    );
    setSaving(false);
    onChanged();
  };

  const gen = () => new Date().toLocaleDateString();

  // Public, login-free link to view + sign this exact payslip. The token is
  // the credential (created with the payslip row). Falls back to the in-app
  // payslips page if the token isn't loaded yet (e.g. just issued).
  const shareUrl = () =>
    payslip?.share_token
      ? `${window.location.origin}/sign-payslip/${payslip.share_token}`
      : `${window.location.origin}/list/payslips`;

  const shareMsg = () =>
    t("fin.shareMessageLink", {
      name: person.name,
      month: monthLabel,
      amount: money(netAmount),
      url: shareUrl(),
    });

  const shareWhatsApp = () => {
    const digits = (person.phone || "").replace(/\D/g, "");
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(shareMsg())}`
      : `https://wa.me/?text=${encodeURIComponent(shareMsg())}`;
    window.open(url, "_blank");
  };
  const shareEmail = () => {
    const subject = `${t("fin.payslip")} — ${monthLabel}`;
    window.location.href = `mailto:${person.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareMsg())}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">{t("fin.payslip")} · {person.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-gray-700">
            <div><span className="text-gray-400 text-xs block">{t("fin.payMonth")}</span>{monthLabel}</div>
            <div><span className="text-gray-400 text-xs block">{t("fin.colRole")}</span><span className="capitalize">{person.role}</span></div>
            <div><span className="text-gray-400 text-xs block">{t("fin.pdfNetPay")}</span><span className="font-semibold">{money(netAmount)}</span></div>
            <div>
              <span className="text-gray-400 text-xs block">{t("fin.colStatus")}</span>
              {paid ? <span className="text-green-700">{t("fin.statusPaid")}</span> : <span className="text-yellow-700">{t("fin.unpaidLabel")}</span>}
            </div>
          </div>

          {/* Admin signature */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">{t("fin.yourSignature")}</p>
            {issued ? (
              <div className="flex items-center gap-3">
                <img src={payslip!.admin_signature!} alt="" className="h-12 border border-gray-200 rounded bg-white" />
                <span className="text-xs text-emerald-700 font-medium">✔ {t("fin.issuedLabel")}</span>
              </div>
            ) : (
              <>
                <SignaturePad onChange={setAdminSig} clearLabel={t("fin.cancelEdit")} />
                <button
                  onClick={signAndIssue}
                  disabled={!adminSig || saving}
                  className="mt-2 w-full bg-blue-600 text-white text-sm py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? t("fin.saving") : t("fin.signAndIssue")}
                </button>
              </>
            )}
          </div>

          {/* Share (after issued) */}
          {issued && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">{t("fin.share")}</p>
              <div className="flex gap-2">
                <button onClick={shareWhatsApp} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
                  <span aria-hidden>🟢</span> {t("fin.shareWhatsapp")}
                </button>
                <button onClick={shareEmail} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                  <span aria-hidden>✉️</span> {t("fin.shareEmail")}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">{t("fin.shareLinkHint")}</p>
            </div>
          )}

          {/* Employee acknowledgement */}
          {issued && (
            <div className="rounded-lg border p-3">
              {acknowledged ? (
                <div>
                  <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100">✔</span>
                    {t("fin.acknowledgedOn", { date: payslip?.employee_signed_at ? new Date(payslip.employee_signed_at).toLocaleDateString() : "" })}
                  </p>
                  {payslip?.employee_signature && (
                    <img src={payslip.employee_signature} alt="" className="h-12 mt-2 border border-gray-200 rounded bg-white" />
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700">⏳ {t("fin.awaitingEmployee")}</p>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button
            onClick={() => downloadPayslips(school, [slipData()], pdfLabels, gen(), `payslip-${person.name.replace(/\s+/g, "-")}-${month}.pdf`)}
            className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200"
          >
            {t("fin.downloadPdf")}
          </button>
          <button
            onClick={() => printPayslips(school, [slipData()], pdfLabels, gen())}
            className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-gray-900"
          >
            {t("fin.printPdf")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPayslipModal;
