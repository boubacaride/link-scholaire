"use client";

// Admin-only: set the annual tuition fee for each francophone class
// (CI → Terminale). Values persist per school in grade_fee_settings via a
// bulk upsert (RLS restricts writes to admins of the school).

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import { FRENCH_GRADES } from "@/lib/fees/grades";

const GradeFeesSettings = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();

  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US");

  const load = useCallback(async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from("grade_fee_settings")
      .select("grade_name, amount")
      .eq("school_id", user.schoolId);
    if (err) { setError(t("fin.gradeFeesLoadError")); setLoading(false); return; }
    const map: Record<string, string> = {};
    (data as { grade_name: string; amount: number }[] | null)?.forEach((r) => {
      map[r.grade_name] = String(r.amount ?? 0);
    });
    setAmounts(map);
    setLoading(false);
  }, [supabase, user?.schoolId, t]);

  useEffect(() => { load(); }, [load]);

  const setAmount = (grade: string, value: string) => {
    // digits only
    setAmounts((m) => ({ ...m, [grade]: value.replace(/[^\d]/g, "") }));
    setSaved(false);
  };

  const save = async () => {
    if (!supabase || !user?.schoolId || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const rows = FRENCH_GRADES.map((g) => ({
      school_id: user.schoolId,
      grade_name: g,
      amount: Math.max(0, Math.round(Number(amounts[g] || 0))),
      updated_at: new Date().toISOString(),
    }));
    const { error: err } = await supabase
      .from("grade_fee_settings")
      .upsert(rows, { onConflict: "school_id,grade_name" });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
  };

  if (!isAdmin) return null;

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("fin.gradeFeesTitle")}</h2>
      <p className="text-xs text-gray-500 mb-4">{t("fin.gradeFeesHint")}</p>

      {loading ? (
        <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-400">…</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">{t("fin.gradeFeesClass")}</th>
                  <th className="text-right font-semibold px-4 py-2.5">{t("fin.gradeFeesAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {FRENCH_GRADES.map((grade) => (
                  <tr key={grade} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-medium text-gray-800">{grade}</td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amounts[grade] ? nf.format(Number(amounts[grade])) : ""}
                        onChange={(e) => setAmount(grade, e.target.value)}
                        placeholder="0"
                        aria-label={`${t("fin.gradeFeesAmount")} — ${grade}`}
                        className="w-40 ml-auto block text-right px-3 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-40"
            >
              {saving ? t("fin.gradeFeesSaving") : t("fin.gradeFeesSave")}
            </button>
            {saved && <span className="text-sm text-green-600">✓ {t("fin.gradeFeesSaved")}</span>}
          </div>
        </>
      )}
    </div>
  );
};

export default GradeFeesSettings;
