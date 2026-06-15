"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";

const ProfilePage = () => {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="bg-white rounded-xl p-6 border shadow-sm">
        <h1 className="text-xl font-semibold mb-6">{t("ui.myProfile")}</h1>
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {user ? `${user.firstName[0]}${user.lastName[0]}` : "?"}
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.firstName")}</label>
                <p className="text-gray-800 font-medium">{user?.firstName || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.lastName")}</label>
                <p className="text-gray-800 font-medium">{user?.lastName || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.email")}</label>
                <p className="text-gray-800 font-medium">{user?.email || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.role")}</label>
                <p className="text-gray-800 font-medium capitalize">{user?.role?.replace("_", " ") || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.school")}</label>
                <p className="text-gray-800 font-medium">{user?.schoolName || "—"}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.schoolType")}</label>
                <p className="text-gray-800 font-medium capitalize">{user?.schoolType || "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
