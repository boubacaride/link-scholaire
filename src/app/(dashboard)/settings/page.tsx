"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const [msg, setMsg] = useState("");

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="bg-white rounded-xl p-6 border shadow-sm">
        <h1 className="text-xl font-semibold mb-6">Settings</h1>

        {/* Account section */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Account</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">Email</p>
                <p className="text-xs text-gray-500">{user?.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">Role</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace("_", " ") || "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">School</p>
                <p className="text-xs text-gray-500">{user?.schoolName || "—"} ({user?.schoolType || "—"})</p>
              </div>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">Language</p>
                <p className="text-xs text-gray-500">English</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-800">Notifications</p>
                <p className="text-xs text-gray-500">Enabled</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Actions</h2>
          <div className="flex gap-3">
            <button
              onClick={async () => { await signOut(); setMsg("Signed out"); }}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition"
            >
              Sign Out
            </button>
          </div>
          {msg && <p className="text-sm text-green-600 mt-2">{msg}</p>}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
