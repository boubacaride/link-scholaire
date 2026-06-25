"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

/** Self-contained password-change form. Works for every role —
 *  Supabase Auth's updateUser is identical no matter the profile.role.
 *
 *  We verify the CURRENT password before issuing the update: Supabase's
 *  updateUser doesn't require it, but skipping that check means anyone
 *  with a hijacked session could lock the real owner out. We re-sign-in
 *  against the same email/password to confirm. */
const ChangePasswordPanel = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setErr(null); setDone(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user?.email) return;
    setErr(null); setDone(false);

    if (next.length < 8) {
      setErr(t("settings.pwTooShort"));
      return;
    }
    if (next !== confirm) {
      setErr(t("settings.pwMismatch"));
      return;
    }

    setBusy(true);
    // 1) Verify the current password by re-signing in.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInErr) {
      setErr(t("settings.pwWrongCurrent"));
      setBusy(false);
      return;
    }

    // 2) Issue the password change.
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updErr) { setErr(updErr.message); return; }

    setDone(true);
    setCurrent(""); setNext(""); setConfirm("");
    setTimeout(() => { setDone(false); setOpen(false); }, 2500);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <button
        onClick={() => { setOpen((v) => !v); if (open) reset(); }}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-medium text-gray-800">{t("settings.changePassword")}</p>
          <p className="text-xs text-gray-500">{t("settings.changePasswordHint")}</p>
        </div>
        <span className={`text-gray-400 text-xs transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] text-gray-500">{t("settings.currentPassword")}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500">{t("settings.newPassword")}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">{t("settings.confirmPassword")}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{err}</p>}
          {done && <p className="text-xs text-green-700 bg-green-50 rounded px-3 py-2">{t("settings.pwUpdated")}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { reset(); setOpen(false); }}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "…" : t("settings.updatePassword")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ChangePasswordPanel;
