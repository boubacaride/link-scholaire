"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { roleHome } from "@/lib/roleHome";
import { useI18n } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LinkScholaireLogo from "@/components/LinkScholaireLogo";
import Image from "next/image";

export default function SignInPage() {
  const router = useRouter();
  const { signIn, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(roleHome(result.role));
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
      router.push(roleHome(result.role));
    }
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Language switcher — moved to the start side so it doesn't fight the
          brand mark in the top-right corner. */}
      <div className="absolute top-4 start-4 z-20">
        <LanguageSwitcher />
      </div>
      {/* Brand mark — top-right corner. Sits in a dark navy pill that matches
          the wordmark's original artwork background so it stays legible whether
          the corner falls over the gradient panel or the light sign-in panel. */}
      <div className="absolute top-4 end-4 z-20">
        <div
          className="rounded-2xl px-4 py-2.5 shadow-lg"
          style={{ background: "rgb(18, 21, 62)" }}
        >
          <LinkScholaireLogo size={36} />
        </div>
      </div>
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 items-center justify-center p-12">
        <div className="max-w-md text-white">
          {/* The pink square in the wordmark sits ~7.8% from the logo's left
              edge — translateX(-7.8%) shifts it so the pink square's center
              lines up with the "M" of the tagline below. */}
          <div className="mb-8 overflow-visible">
            <Image
              src="/logo.png"
              alt="Link Scholaire"
              width={580}
              height={100}
              priority
              className="h-24 w-auto"
              style={{ transform: "translateX(-7.8%)" }}
            />
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            {t("signIn.brandTagline")}
          </h2>
          <p className="text-blue-100 text-lg leading-relaxed">
            {t("signIn.brandBody")}
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">5+</div>
              <div className="text-xs text-blue-200">{t("signIn.statRoles")}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">LMS</div>
              <div className="text-xs text-blue-200">{t("signIn.statBuiltIn")}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold">24/7</div>
              <div className="text-xs text-blue-200">{t("signIn.statAccess")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Sign In Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile header — the wordmark uses white text, so it needs a dark
              backdrop to stay legible against the light gray sign-in panel. */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl px-6 py-4">
              <Image
                src="/logo.png"
                alt="Link Scholaire"
                width={350}
                height={60}
                priority
                className="h-16 w-auto"
              />
            </div>
          </div>

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
