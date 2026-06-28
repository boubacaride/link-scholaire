"use client";

// Print / Download / Share toolbar for a dashboard tab. Operates on the DOM
// node referenced by `targetRef`, producing an A4 PDF (see lib/exportPdf).
// The bar sits OUTSIDE the captured node so the buttons never appear in output.

import { useState } from "react";
import { useI18n } from "@/contexts/LanguageContext";
import { downloadTabPdf, printTabPdf, shareTabPdf } from "@/lib/exportPdf";

interface Props {
  targetRef: React.RefObject<HTMLDivElement | null>;
  filename: string;
  title: string;
}

type Action = "print" | "download" | "share";

const ExportBar = ({ targetRef, filename, title }: Props) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action, fn: (node: HTMLElement) => Promise<unknown>) => {
    const node = targetRef.current;
    if (!node || busy) return;
    setBusy(action);
    try {
      await fn(node);
    } catch {
      /* user cancelled the share sheet, or capture failed — nothing to surface */
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2 mb-2">
      <button
        type="button"
        className={btn}
        disabled={busy !== null}
        onClick={() => run("print", (n) => printTabPdf(n, filename))}
        aria-label={t("perf.print")}
      >
        <span aria-hidden>🖨️</span>
        {busy === "print" ? t("perf.exporting") : t("perf.print")}
      </button>
      <button
        type="button"
        className={btn}
        disabled={busy !== null}
        onClick={() => run("download", (n) => downloadTabPdf(n, filename))}
        aria-label={t("perf.download")}
      >
        <span aria-hidden>⬇️</span>
        {busy === "download" ? t("perf.exporting") : t("perf.download")}
      </button>
      <button
        type="button"
        className={btn}
        disabled={busy !== null}
        onClick={() => run("share", (n) => shareTabPdf(n, filename, title))}
        aria-label={t("perf.share")}
      >
        <span aria-hidden>🔗</span>
        {busy === "share" ? t("perf.exporting") : t("perf.share")}
      </button>
    </div>
  );
};

export default ExportBar;
