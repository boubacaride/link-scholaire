"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

const ProfilePage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const startEdit = () => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
    setMsg("");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setMsg("");
  };

  const save = async () => {
    if (!supabase || !user?.profileId) return;
    if (!firstName.trim() || !lastName.trim()) {
      setMsg("First name and last name are required.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim() })
        .eq("id", user.profileId);
      if (error) throw error;
      // AuthContext snapshots the profile at sign-in; a reload is the
      // simplest way to refresh the displayed name everywhere.
      window.location.reload();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
      setSaving(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="bg-white rounded-xl p-6 border shadow-sm">
        <div className="flex items-center justify-between mb-6 gap-3">
          <h1 className="text-xl font-semibold">{t("ui.myProfile")}</h1>
          {!editing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white shadow-sm hover:opacity-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {t("common.edit")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancel}
                disabled={saving}
                className="text-sm px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-sm px-3 py-1.5 rounded-md bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white shadow-sm disabled:opacity-50"
              >
                {saving ? "…" : t("common.save")}
              </button>
            </div>
          )}
        </div>

        {msg && (
          <p className={`text-sm mb-4 ${msg.startsWith("Error") ? "text-red-500" : "text-amber-600"}`}>
            {msg}
          </p>
        )}

        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {user ? `${user.firstName[0]}${user.lastName[0]}` : "?"}
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.firstName")}</label>
                {editing ? (
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full ring-[1.5px] ring-gray-300 focus:ring-[#4a7eb0] outline-none p-2 rounded-md text-sm"
                  />
                ) : (
                  <p className="text-gray-800 font-medium">{user?.firstName || "—"}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">{t("ui.lastName")}</label>
                {editing ? (
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full ring-[1.5px] ring-gray-300 focus:ring-[#4a7eb0] outline-none p-2 rounded-md text-sm"
                  />
                ) : (
                  <p className="text-gray-800 font-medium">{user?.lastName || "—"}</p>
                )}
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
