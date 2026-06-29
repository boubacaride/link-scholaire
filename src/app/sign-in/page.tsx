"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { roleHome } from "@/lib/roleHome";
import type { UserRole } from "@/types";
import { useI18n } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LinkScholaireLogo from "@/components/LinkScholaireLogo";

export default function SignInPage() {
  const router = useRouter();
  const { signIn, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Send the user back to the page they were bounced from (?next=), but only
  // if it's a safe in-app path; otherwise fall back to their role's home.
  const destination = (role?: UserRole | null) => {
    if (typeof window !== "undefined") {
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    }
    return roleHome(role);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(destination(result.role));
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("demo123456");
    setError("");
    setLoading(true);
    const result = await signIn(demoEmail, "demo123456");
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(destination(result.role));
    }
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Brand mark — top-left corner. The dark navy pill matches the new
          page navy so it blends invisibly on the left branding panel, and
          gives the white wordmark a legible backdrop when it sits over the
          light sign-in panel on mobile. */}
      <div className="absolute top-4 start-4 z-20">
        <div
          className="rounded-2xl px-4 py-2.5 shadow-lg"
          style={{ background: "rgb(18, 21, 62)" }}
        >
          <LinkScholaireLogo size={48} />
        </div>
      </div>
      {/* Language switcher — top-right corner. */}
      <div className="absolute top-4 end-4 z-20">
        <LanguageSwitcher />
      </div>
      {/* Left — Branding (solid navy block, matches the wordmark artwork). */}
      <div
        className="hidden lg:flex lg:w-1/2 items-center justify-center px-12 py-16"
        style={{ background: "rgb(18, 21, 62)" }}
      >
        <div className="max-w-md text-white">
          {/* Thin brand-color accent bar — picks up the chain icon palette
              (magenta → amber → cyan) and grounds the type below. */}
          <div
            className="h-1 w-16 rounded-full mb-6"
            style={{ background: "linear-gradient(90deg, #E63D8D 0%, #F5C544 50%, #5BC0EB 100%)" }}
          />
          {(() => {
            const tagline = t("signIn.brandTagline");
            const highlight = t("signIn.brandHighlight");
            const idx = tagline.toLowerCase().lastIndexOf(highlight.toLowerCase());
            const lead = idx >= 0 ? tagline.slice(0, idx).trim() : tagline;
            const tail = idx >= 0 ? tagline.slice(idx).trim() : "";
            return (
              <h2 className="text-5xl font-bold leading-[1.1] tracking-tight mb-6">
                <span className="block">{lead}</span>
                {tail && (
                  <span
                    className="block mt-2"
                    style={{
                      backgroundImage: "linear-gradient(90deg, #E63D8D 0%, #F5C544 55%, #5BC0EB 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {tail}
                  </span>
                )}
              </h2>
            );
          })()}
          <p
            className="text-lg leading-relaxed max-w-sm"
            style={{ color: "rgba(255, 255, 255, 0.72)" }}
          >
            {t("signIn.brandBody")}
          </p>
        </div>
      </div>

      {/* Right — Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("signIn.welcomeBack")}</h2>
          <p className="text-gray-500 mb-8">{t("signIn.subtitle")}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("signIn.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("signIn.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("signIn.passwordPlaceholder")}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || authLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("signIn.signingIn") : t("signIn.signInButton")}
            </button>
          </form>

          {/* Demo Accounts */}
          <div className="mt-8 border-t pt-6">
            <p className="text-xs text-gray-400 text-center mb-4 uppercase tracking-wide font-semibold">{t("signIn.demoAccess")}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Admin", email: "admin@demo.edu", color: "bg-purple-50 text-purple-700 border-purple-200" },
                { label: "Teacher", email: "teacher@demo.edu", color: "bg-blue-50 text-blue-700 border-blue-200" },
                { label: "Student", email: "student@demo.edu", color: "bg-green-50 text-green-700 border-green-200" },
                { label: "Parent", email: "parent@demo.edu", color: "bg-orange-50 text-orange-700 border-orange-200" },
              ].map((demo) => (
                <button
                  key={demo.label}
                  type="button"
                  onClick={() => handleDemoLogin(demo.email)}
                  className={`py-2 px-3 border rounded-lg text-xs font-medium transition-colors hover:opacity-80 ${demo.color}`}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-8">
            &copy; {new Date().getFullYear()} Link Scholaire. {t("signIn.rights")}
          </p>
        </div>
      </div>
    </div>
  );
}
