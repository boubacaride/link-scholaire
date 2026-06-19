"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/LanguageContext";

const ChemistryPage = () => {
  const router = useRouter();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/list/labs")} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition">
            ← {t("labs.backToLabs")}
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6,2 L6,8 L3,14 L13,14 L10,8 L10,2" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                <line x1="6" y1="2" x2="10" y2="2" stroke="#fff" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-800">{t("labs.chemistryHeaderTitle")}</h1>
              <p className="text-[10px] text-gray-400">{t("labs.chemistryPoweredBy")}</p>
            </div>
          </div>
        </div>
        <a
          href="https://zperiod.app/?lang=fr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
        >
          {t("labs.openInNewTab")} ↗
        </a>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 flex-shrink-0">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t("labs.chemistryLoading")}</p>
          </div>
        </div>
      )}

      {/* Embedded iframe + branding overlay */}
      <div className="relative flex-1" style={{ display: isLoading ? "none" : "block" }}>
        <iframe
          src="https://zperiod.app/?lang=fr"
          className="w-full h-full border-none block"
          onLoad={() => setIsLoading(false)}
          allow="fullscreen"
          title={t("labs.chemistryIframeTitle")}
        />
        {/* We can't edit the third-party iframe's DOM (same-origin policy),
            so we mask the upstream "Z / Zperiod" wordmark with our own
            "LS / LSperiod" badge in the same top-left position. Adjust the
            offsets here if the upstream layout shifts. */}
        <div className="absolute top-2 left-2 flex items-center gap-2 bg-white shadow-sm rounded-md px-2.5 py-1.5 pointer-events-none select-none">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-600 to-violet-700 text-white text-xs font-bold flex items-center justify-center">
            LS
          </span>
          <span className="text-sm font-semibold text-gray-800">LSperiod</span>
        </div>
      </div>
    </div>
  );
};

export default ChemistryPage;
