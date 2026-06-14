"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/** Top navy strip: school name on the left, language switcher · Help · user
 *  dropdown on the right. Modelled on ProgressBook's main-header bar — kept
 *  intentionally compact (small vertical padding, no big icons). */
const Navbar = () => {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the user dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const username = user?.email?.split("@")[0] || user?.firstName || "Guest";

  return (
    <div className="bg-[#1c1c1c] text-white px-4 py-1.5 flex items-center justify-between text-sm">
      <span className="font-medium truncate">{user?.schoolName || "SchoolFlow"}</span>

      <div className="flex items-center gap-4 shrink-0">
        <LanguageSwitcher />
        <Link href="/profile" className="text-white/80 hover:text-white text-xs hidden sm:inline">
          {t("nav.help") !== "nav.help" ? t("nav.help") : "Help"}
        </Link>
        <div ref={wrapRef} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs hover:text-white/80"
          >
            <span className="truncate max-w-[140px]">{username}</span>
            <Caret />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white text-gray-700 rounded-md shadow-lg border border-gray-200 min-w-[160px] py-1 z-50">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50"
              >
                <span aria-hidden>👤</span> {t("nav.profile") !== "nav.profile" ? t("nav.profile") : "My Account"}
              </Link>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setOpen(false); signOut?.(); }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50"
              >
                <span aria-hidden>⎋</span> {t("nav.signOut") !== "nav.signOut" ? t("nav.signOut") : "Sign Out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Caret = () => (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

export default Navbar;
