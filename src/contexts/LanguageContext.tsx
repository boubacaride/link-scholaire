"use client";

import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from "react";
import { translations, Locale, LOCALES, RTL_LOCALES } from "@/lib/i18n/translations";

// French is the default language for the platform.
const DEFAULT_LOCALE: Locale = "fr";

interface I18nContextType {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  dir: "ltr",
  setLocale: () => {},
  t: (key) => key,
});

function resolve(dict: unknown, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>(
    (obj, part) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[part] : undefined),
    dict
  );
  return typeof value === "string" ? value : undefined;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Hydrate the saved choice (falls back to French).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("locale") as Locale | null;
      if (saved && LOCALES.includes(saved)) setLocaleState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Keep <html lang> and text direction in sync (RTL for Arabic).
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem("locale", l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = resolve(translations[locale], key) ?? resolve(translations.en, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`{${k}}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale]
  );

  const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

  return (
    <I18nContext.Provider value={{ locale, dir, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
