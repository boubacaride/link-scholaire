"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/LanguageContext";
import { LOCALES, LOCALE_LABELS, Locale } from "@/lib/i18n/translations";

interface LanguageSwitcherProps {
  /** "light" for dark backgrounds (e.g. the sign-in hero), "default" otherwise. */
  variant?: "default" | "light";
}

/** Compact globe dropdown to switch between English, French and Arabic.
 *  Selection is persisted and applies across every page (and flips the app
 *  to RTL for Arabic). */
const LanguageSwitcher = ({ variant = "default" }: LanguageSwitcherProps) => {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const trigger =
    variant === "light"
      ? "bg-white/15 text-white hover:bg-white/25"
      : "bg-white border text-gray-700 hover:bg-gray-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("language.label")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${trigger}`}
      >
        {/* globe */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{LOCALE_LABELS[locale].short}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-50">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                locale === l ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{LOCALE_LABELS[l].native}</span>
              <span className="text-xs text-gray-400">{LOCALE_LABELS[l].short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
