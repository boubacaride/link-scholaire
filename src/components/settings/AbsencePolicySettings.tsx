"use client";

// School-admin editable absence policy: education stage (the gate),
// require-approval-for-all-absences, and the extended-absence day threshold.
// School admins cannot UPDATE schools directly (RLS is platform-admin only),
// so writes go through the update_school_absence_settings SECURITY DEFINER RPC.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";

const AbsencePolicySettings = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";

  const [stage, setStage] = useState<"k12" | "higher_ed">("k12");
  const [requireAll, setRequireAll] = useState(false);
  const [extendedDays, setExtendedDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from("schools")
      .select("education_stage, require_approval_all_absences, extended_absence_days")
      .eq("id", user.schoolId)
      .single();
    if (err || !data) { setError(t("abs.loadError")); setLoading(false); return; }
    setStage((data.education_stage as "k12" | "higher_ed") ?? "k12");
    setRequireAll(!!data.require_approval_all_absences);
    setExtendedDays(data.extended_absence_days ?? 3);
    setLoading(false);
  }, [supabase, user?.schoolId, t]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const { data, error: err } = await supabase.rpc("update_school_absence_settings", {
      p_education_stage: stage,
      p_require_approval: requireAll,
      p_extended_days: Math.max(1, Math.round(extendedDays || 1)),
    });
    setSaving(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? t("abs.loadError")); return; }
    setSaved(true);
  };

  if (!isAdmin) return null;

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("abs.settingsTitle")}</h2>
      <p className="text-xs text-gray-500 mb-4">{t("abs.settingsHint")}</p>

      {loading ? (
        <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-400">…</div>
      ) : (
        <div className="space-y-4">
          {/* Education stage */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-800 mb-1">{t("abs.educationStage")}</p>
            <select
              value={stage}
              onChange={(e) => { setStage(e.target.value as "k12" | "higher_ed"); setSaved(false); }}
              className="w-full max-w-md text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="k12">{t("abs.stageK12")}</option>
              <option value="higher_ed">{t("abs.stageHigherEd")}</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">{t("abs.stageHint")}</p>
          </div>

          {/* Require approval for all */}
          <div className="p-4 bg-gray-50 rounded-lg flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{t("abs.requireApprovalAll")}</p>
              <p className="text-xs text-gray-400">{t("abs.requireApprovalAllHint")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireAll}
              onClick={() => { setRequireAll((v) => !v); setSaved(false); }}
              className={`shrink-0 w-11 h-6 rounded-full transition-colors ${requireAll ? "bg-blue-600" : "bg-gray-300"}`}
            >
              <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${requireAll ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Extended threshold */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-800 mb-1">{t("abs.extendedDays")}</p>
            <input
              type="number"
              min={1}
              value={extendedDays}
              onChange={(e) => { setExtendedDays(Number(e.target.value)); setSaved(false); }}
              className="w-28 text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <p className="mt-1 text-xs text-gray-400">{t("abs.extendedDaysHint")}</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-40"
            >
              {saving ? t("abs.saving") : t("abs.save")}
            </button>
            {saved && <span className="text-sm text-green-600">✓ {t("abs.saved")}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default AbsencePolicySettings;
