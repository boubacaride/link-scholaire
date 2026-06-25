"use client";

import { useI18n } from "@/contexts/LanguageContext";

interface Props {
  /** Returns the live DOM element of the answer bubble to capture.
   *  We use a getter (not a React ref) so the parent can pass any node
   *  it has access to without prop-drilling refs through wrappers. */
  getElement: () => HTMLElement | null;
  /** Title used for the printed document and the download filename. */
  title?: string;
  /** Subject shown under the title in the printable document. Optional. */
  subject?: string;
  /** Tone of the buttons — `dark` for the math lab's dark chat surface,
   *  `light` for the physics lab's white chat bubbles. */
  tone?: "dark" | "light";
  className?: string;
}

const safe = (s: string) => s.replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!),
);

/** Build a self-contained, printable HTML document around the captured
 *  answer HTML. Inline styles + KaTeX CDN stylesheet so the file renders
 *  identically whether opened in a fresh tab or downloaded and shared. */
function buildDocument(
  innerHTML: string,
  title: string,
  subject: string | undefined,
  dir: "ltr" | "rtl",
): string {
  const printedAt = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html lang="en" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safe(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous" />
<style>
  :root { color-scheme: light; }
  html, body { background: #ffffff; color: #111827; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, "Helvetica Neue", Arial, sans-serif;
    margin: 0 auto;
    max-width: 720px;
    padding: 32px 24px 64px;
    line-height: 1.65;
    font-size: 14.5px;
  }
  header { border-bottom: 2px solid #e5e7eb; padding-bottom: 14px; margin-bottom: 22px; }
  h1.doc-title { margin: 0; font-size: 20px; font-weight: 700; color: #111827; }
  .doc-subject { margin-top: 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
  .answer { color: #1f2937; }
  .answer strong { color: #111827; }
  .answer em { color: #374151; }
  .answer a { color: #2563eb; text-decoration: underline; }
  .answer hr { border: none; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .answer img { max-width: 100%; height: auto; border-radius: 6px; }
  .answer code {
    background: #f3f4f6; padding: 2px 6px; border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.92em;
  }
  .answer p { margin: 6px 0; }
  /* KaTeX block math: centre and give it breathing room */
  .katex-display-block, .katex-display { margin: 14px 0; overflow-x: auto; }
  .katex-display-block .katex-display { margin: 0; }
  footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb;
    font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 20mm 18mm; max-width: none; }
    header { border-bottom-width: 1px; }
    a { color: #1d4ed8; }
  }
</style>
</head>
<body>
  <header>
    <h1 class="doc-title">${safe(title)}</h1>
    ${subject ? `<div class="doc-subject">${safe(subject)}</div>` : ""}
  </header>
  <div class="answer">${innerHTML}</div>
  <footer>
    <span>Link Scholaire</span>
    <span>${safe(printedAt)}</span>
  </footer>
</body>
</html>`;
}

const AnswerActions = ({
  getElement, title, subject, tone = "dark", className = "",
}: Props) => {
  const { t, dir, locale } = useI18n();

  const docTitle = title?.trim() || t("labs.solution") || (locale === "fr" ? "Solution" : locale === "ar" ? "الحل" : "Solution");

  const doPrint = () => {
    const el = getElement();
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=720");
    if (!win) return;
    win.document.open();
    win.document.write(buildDocument(el.innerHTML, docTitle, subject, dir));
    win.document.close();
    // Wait for the KaTeX stylesheet (and any pod images) to load before
    // firing the print dialog — otherwise the preview catches an un-styled
    // flash of math glyphs.
    const fire = () => {
      win.focus();
      win.print();
    };
    if (win.document.readyState === "complete") setTimeout(fire, 250);
    else win.addEventListener("load", () => setTimeout(fire, 150));
  };

  const doDownload = () => {
    const el = getElement();
    if (!el) return;
    const doc = buildDocument(el.innerHTML, docTitle, subject, dir);
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const slug = docTitle.replace(/[^a-zA-Z0-9À-ɏ-]+/g, "_").slice(0, 40) || "solution";
    a.href = url;
    a.download = `${slug}-${stamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const baseBtn = "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors";
  const skin = tone === "dark"
    ? "bg-white/[0.08] hover:bg-white/[0.16] text-slate-200 border border-white/[0.08]"
    : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200";

  return (
    <div className={`flex gap-1.5 print:hidden ${className}`}>
      <button
        type="button"
        onClick={doPrint}
        title={t("labs.printSolution")}
        aria-label={t("labs.printSolution")}
        className={`${baseBtn} ${skin}`}
      >
        <span aria-hidden>🖨</span>
        <span>{t("labs.print")}</span>
      </button>
      <button
        type="button"
        onClick={doDownload}
        title={t("labs.downloadSolution")}
        aria-label={t("labs.downloadSolution")}
        className={`${baseBtn} ${skin}`}
      >
        <span aria-hidden>⬇</span>
        <span>{t("labs.download")}</span>
      </button>
    </div>
  );
};

export default AnswerActions;
