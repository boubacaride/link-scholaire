// Capture a DOM node into an A4 PDF and print / download / share it.
//
// jspdf + html2canvas are heavy and browser-only, so they're dynamically
// imported inside the handlers — kept out of the initial bundle and never run
// during SSR. Everything renders to a single image flowed across A4 pages.

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

async function nodeToPdf(node: HTMLElement) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasMod.default;

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();  // 210mm
  const pageH = pdf.internal.pageSize.getHeight(); // 297mm
  const margin = 8;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const contentH = pageH - margin * 2;
  const imgData = canvas.toDataURL("image/png");

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, "PNG", margin, margin + position, imgW, imgH, undefined, "FAST");
  heightLeft -= contentH;
  while (heightLeft > 0) {
    position -= contentH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, margin + position, imgW, imgH, undefined, "FAST");
    heightLeft -= contentH;
  }
  return pdf;
}

export async function downloadTabPdf(node: HTMLElement, filename: string): Promise<void> {
  const pdf = await nodeToPdf(node);
  pdf.save(filename);
}

export async function printTabPdf(node: HTMLElement, filename = "report.pdf"): Promise<void> {
  const pdf = await nodeToPdf(node);
  pdf.autoPrint();
  const url = pdf.output("bloburl") as unknown as string;
  const win = window.open(url, "_blank");
  if (!win) pdf.save(filename); // popup blocked → fall back to a download
}

/** Returns "shared" when the Web Share sheet was used, "downloaded" when the
 *  browser can't share files and we fell back to a download. */
export async function shareTabPdf(
  node: HTMLElement,
  filename: string,
  title: string,
): Promise<"shared" | "downloaded"> {
  const pdf = await nodeToPdf(node);
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as ShareNavigator;
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title });
    return "shared";
  }
  pdf.save(filename);
  return "downloaded";
}
