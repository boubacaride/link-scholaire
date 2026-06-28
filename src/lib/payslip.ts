// Payslip PDF generation — one A4 page per employee, drawn with jsPDF text
// (crisp, selectable). jspdf is dynamically imported (browser-only, kept out
// of the initial bundle). Labels are passed in so the document is bilingual.

import type { jsPDF } from "jspdf";

export interface PayslipLabels {
  payslip: string;
  payPeriod: string;
  employee: string;
  role: string;
  netPay: string;
  status: string;
  paid: string;
  unpaid: string;
  paidOn: string;
  employeeSignature: string;
  authorizedSignature: string;
  generatedOn: string;
}

export interface PayslipSchool { name: string; address?: string | null }

export interface PayslipData {
  employeeName: string;
  role: string;
  payMonthLabel: string;     // "June 2026"
  netAmount: number;
  status: "paid" | "unpaid";
  paidOn?: string | null;    // localized date string
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const M = 16;       // page margin (mm)
const W = 210;      // A4 width

function drawPayslip(pdf: jsPDF, school: PayslipSchool, s: PayslipData, L: PayslipLabels, generatedOn: string) {
  let y = 22;
  pdf.setTextColor(20);
  pdf.setFont("helvetica", "bold").setFontSize(16);
  pdf.text(school.name || "", M, y);
  pdf.setFontSize(20).setTextColor(58, 109, 154);
  pdf.text(L.payslip.toUpperCase(), W - M, y, { align: "right" });
  pdf.setTextColor(20);

  if (school.address) {
    y += 6;
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(120);
    pdf.text(school.address, M, y);
    pdf.setTextColor(20);
  }

  y += 10;
  pdf.setDrawColor(210).line(M, y, W - M, y);
  y += 12;

  const field = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold").setFontSize(11).text(label, M, y);
    pdf.setFont("helvetica", "normal").text(value, M + 42, y);
    y += 8;
  };
  field(L.payPeriod, s.payMonthLabel);
  field(L.employee, s.employeeName);
  field(L.role, s.role);

  // Net pay box
  y += 4;
  pdf.setFillColor(245, 247, 250).rect(M, y, W - 2 * M, 24, "F");
  pdf.setFont("helvetica", "bold").setFontSize(11).text(L.netPay, M + 6, y + 14);
  pdf.setFontSize(18).text(money(s.netAmount), W - M - 6, y + 15, { align: "right" });
  y += 34;

  // Status
  pdf.setFontSize(11).setFont("helvetica", "bold").text(L.status, M, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    s.status === "paid" ? `${L.paid}${s.paidOn ? ` — ${L.paidOn} ${s.paidOn}` : ""}` : L.unpaid,
    M + 42, y,
  );

  // Signatures
  const sigY = 245;
  pdf.setDrawColor(120);
  pdf.line(M, sigY, M + 60, sigY);
  pdf.line(W - M - 60, sigY, W - M, sigY);
  pdf.setFontSize(9).setTextColor(110);
  pdf.text(L.employeeSignature, M, sigY + 5);
  pdf.text(L.authorizedSignature, W - M - 60, sigY + 5);

  // Footer
  pdf.setFontSize(8).setTextColor(150);
  pdf.text(`${L.generatedOn} ${generatedOn}`, M, 285);
  pdf.setTextColor(20);
}

async function buildPdf(school: PayslipSchool, slips: PayslipData[], labels: PayslipLabels, generatedOn: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");
  slips.forEach((s, i) => {
    if (i > 0) pdf.addPage();
    drawPayslip(pdf, school, s, labels, generatedOn);
  });
  return pdf;
}

/** Open the payslips PDF and trigger the print dialog (falls back to a
 *  download if the popup is blocked). */
export async function printPayslips(
  school: PayslipSchool, slips: PayslipData[], labels: PayslipLabels, generatedOn: string,
): Promise<void> {
  if (slips.length === 0) return;
  const pdf = await buildPdf(school, slips, labels, generatedOn);
  pdf.autoPrint();
  const url = pdf.output("bloburl") as unknown as string;
  const win = window.open(url, "_blank");
  if (!win) pdf.save("payslips.pdf");
}
