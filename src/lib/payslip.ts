// Payslip PDF generation — one A4 page per employee, drawn with jsPDF text
// (crisp, selectable) plus the Link Scolaire logo and any captured
// signatures. jspdf is dynamically imported (browser-only, off the initial
// bundle). Labels are passed in so the document is bilingual.

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
  acknowledged: string;
  employeeSignature: string;
  authorizedSignature: string;
  generatedOn: string;
}

export interface PayslipSchool { name: string; address?: string | null }

export interface PayslipData {
  employeeName: string;
  role: string;
  payMonthLabel: string;          // "June 2026"
  netAmount: number;
  status: "paid" | "unpaid";
  paidOn?: string | null;         // localized date string
  acknowledged?: boolean;         // employee signed
  adminSignature?: string | null; // PNG data URL
  employeeSignature?: string | null;
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const M = 16;       // page margin (mm)
const W = 210;      // A4 width

let logoCache: string | null | undefined;
async function loadLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch("/logo-mark.png");
    const blob = await res.blob();
    logoCache = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

function drawPayslip(
  pdf: jsPDF,
  school: PayslipSchool,
  s: PayslipData,
  L: PayslipLabels,
  generatedOn: string,
  logo: string | null,
) {
  let y = 14;
  // Brand logo (top-left) — Link Scolaire wordmark (~4.9:1).
  if (logo) {
    const lw = 48;
    pdf.addImage(logo, "PNG", M, y, lw, lw / 4.9);
  }
  pdf.setFont("helvetica", "bold").setFontSize(20).setTextColor(58, 109, 154);
  pdf.text(L.payslip.toUpperCase(), W - M, y + 6, { align: "right" });
  pdf.setTextColor(20);

  y = 32;
  pdf.setFont("helvetica", "bold").setFontSize(12).text(school.name || "", M, y);
  if (school.address) {
    y += 5;
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(120).text(school.address, M, y);
    pdf.setTextColor(20);
  }

  y += 8;
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

  // Status (paid + acknowledged)
  pdf.setFontSize(11).setFont("helvetica", "bold").text(L.status, M, y);
  pdf.setFont("helvetica", "normal");
  const statusText = s.status === "paid" ? `${L.paid}${s.paidOn ? ` — ${L.paidOn} ${s.paidOn}` : ""}` : L.unpaid;
  pdf.text(statusText, M + 42, y);
  if (s.acknowledged) {
    y += 7;
    pdf.setTextColor(22, 163, 74).setFont("helvetica", "bold").text(`✔ ${L.acknowledged}`, M + 42, y);
    pdf.setTextColor(20).setFont("helvetica", "normal");
  }

  // Signatures (images above the lines when present)
  const sigY = 250;
  const sigW = 55, sigH = 20;
  if (s.employeeSignature) {
    try { pdf.addImage(s.employeeSignature, "PNG", M, sigY - sigH - 1, sigW, sigH); } catch { /* skip bad image */ }
  }
  if (s.adminSignature) {
    try { pdf.addImage(s.adminSignature, "PNG", W - M - sigW, sigY - sigH - 1, sigW, sigH); } catch { /* skip */ }
  }
  pdf.setDrawColor(120);
  pdf.line(M, sigY, M + sigW, sigY);
  pdf.line(W - M - sigW, sigY, W - M, sigY);
  pdf.setFontSize(9).setTextColor(110);
  pdf.text(L.employeeSignature, M, sigY + 5);
  pdf.text(L.authorizedSignature, W - M - sigW, sigY + 5);

  pdf.setFontSize(8).setTextColor(150).text(`${L.generatedOn} ${generatedOn}`, M, 285);
  pdf.setTextColor(20);
}

async function buildPdf(school: PayslipSchool, slips: PayslipData[], labels: PayslipLabels, generatedOn: string) {
  const { jsPDF } = await import("jspdf");
  const logo = await loadLogo();
  const pdf = new jsPDF("p", "mm", "a4");
  slips.forEach((s, i) => {
    if (i > 0) pdf.addPage();
    drawPayslip(pdf, school, s, labels, generatedOn, logo);
  });
  return pdf;
}

/** Open the payslips PDF and trigger the print dialog (download fallback). */
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

/** Download the payslips PDF. */
export async function downloadPayslips(
  school: PayslipSchool, slips: PayslipData[], labels: PayslipLabels, generatedOn: string, filename: string,
): Promise<void> {
  if (slips.length === 0) return;
  const pdf = await buildPdf(school, slips, labels, generatedOn);
  pdf.save(filename);
}
