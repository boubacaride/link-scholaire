"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { useState } from "react";
import ChangePasswordPanel from "@/components/ChangePasswordPanel";
import AbsencePolicySettings from "@/components/settings/AbsencePolicySettings";
import GradeFeesSettings from "@/components/settings/GradeFeesSettings";

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const { t, locale } = useI18n();
  const [msg, setMsg] = useState("");

  const localeLabel =
    locale === "fr" ? "Français" : locale === "ar" ? "العربية" : "English";

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="bg-white rounded-xl p-6 border shadow-sm">
        <h1 className="text-xl font-semibold mb-6">{t("ui.settings")}</h1>

        {/* Account section */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("ui.account")}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{t("ui.email")}</p>
                <p className="text-xs text-gray-500">{user?.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{t("ui.role")}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace("_", " ") || "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{t("ui.school")}</p>
                <p className="text-xs text-gray-500">{user?.schoolName || "—"} ({user?.schoolType || "—"})</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("settings.security")}</h2>
          <ChangePasswordPanel />
        </div>

        {/* Absence policy (admins only; component self-hides otherwise) */}
        <AbsencePolicySettings />

        {/* Tuition fee per class (admins only; component self-hides otherwise) */}
        <GradeFeesSettings />

        {/* Preferences */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("ui.preferences")}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{t("ui.language")}</p>
                <p className="text-xs text-gray-500">{localeLabel}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">{t("ui.notifications")}</p>
                <p className="text-xs text-gray-500">{t("ui.enabled")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("ui.actions")}</h2>
          <div className="flex gap-3">
            <button
              onClick={async () => { await signOut(); setMsg(t("ui.signedOut")); }}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition"
            >
              {t("ui.signOut")}
            </button>
          </div>
          {msg && <p className="text-sm text-green-600 mt-2">{msg}</p>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
