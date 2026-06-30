"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";

interface SchoolOnboardModalProps {
  onClose: () => void;
  onCreated: () => void;
}

/** Platform-admin flow: create a school + its subscription + the first
 *  school admin in a single atomic call (create_school_with_admin RPC). */
const SchoolOnboardModal = ({ onClose, onCreated }: SchoolOnboardModalProps) => {
  const supabase = createClient();
  const { t } = useI18n();

  const [form, setForm] = useState({
    school_name: "",
    school_type: "private",
    education_stage: "k12",
    plan: "standard",
    max_students: 500,
    max_teachers: 50,
    subscription_status: "active",
    admin_first: "",
    admin_last: "",
    admin_email: "",
    admin_password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.school_name.trim() || !form.admin_email.trim() || !form.admin_password.trim() || !form.admin_first.trim()) {
      setError("School name, admin name, email and password are required.");
      return;
    }
    if (form.admin_password.length < 6) {
      setError("Admin password must be at least 6 characters.");
      return;
    }
    if (!supabase) {
      setError("Backend is not configured.");
      return;
    }
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc("create_school_with_admin", {
      p_school_name: form.school_name,
      p_school_type: form.school_type,
      p_plan: form.plan,
      p_max_students: Number(form.max_students),
      p_max_teachers: Number(form.max_teachers),
      p_subscription_status: form.subscription_status,
      p_admin_email: form.admin_email,
      p_admin_password: form.admin_password,
      p_admin_first: form.admin_first,
      p_admin_last: form.admin_last,
    });
    setSubmitting(false);

    if (rpcError) { setError(rpcError.message); return; }
    if (data?.error) { setError(data.error); return; }

    // Persist the education stage on the freshly-created school. The platform
    // admin has UPDATE rights on schools (RLS), so this second write is the
    // least-invasive way to set it without re-touching the auth-sensitive
    // create_school_with_admin RPC. Backfill already defaults others to 'k12'.
    if (data?.school_id && form.education_stage !== "k12") {
      await supabase.from("schools").update({ education_stage: form.education_stage }).eq("id", data.school_id);
    }

    setSuccess(true);
    onCreated();
    setTimeout(onClose, 1200);
  };

  const input = "mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200";
  const label = "text-[10px] text-gray-400 uppercase tracking-wide";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-semibold">{t("mod.onboardTitle")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          {success ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-green-700 font-medium">{t("mod.created")}</p>
              <p className="text-gray-500 text-sm mt-1">{t("mod.createdHint")}</p>
            </div>
          ) : (
            <>
              {/* School details */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("mod.schoolDetails")}</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className={label}>{t("mod.schoolName")}</label>
                    <input className={input} value={form.school_name} onChange={(e) => set("school_name", e.target.value)} placeholder="Lincoln Academy" />
                  </div>
                  <div>
                    <label className={label}>Type</label>
                    <select className={input} value={form.school_type} onChange={(e) => set("school_type", e.target.value)}>
                      <option value="private">{t("mod.typePrivate")}</option>
                      <option value="public">{t("mod.typePublic")}</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Plan</label>
                    <input className={input} value={form.plan} onChange={(e) => set("plan", e.target.value)} placeholder="standard / premium" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>{t("abs.educationStage")}</label>
                    <select className={input} value={form.education_stage} onChange={(e) => set("education_stage", e.target.value)}>
                      <option value="k12">{t("abs.stageK12")}</option>
                      <option value="higher_ed">{t("abs.stageHigherEd")}</option>
                    </select>
                    <p className="mt-1 text-[10px] text-gray-400 leading-snug">{t("abs.stageHint")}</p>
                  </div>
                  <div>
                    <label className={label}>{t("mod.maxStudents")}</label>
                    <input type="number" min={0} className={input} value={form.max_students} onChange={(e) => set("max_students", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={label}>{t("mod.maxStaff")}</label>
                    <input type="number" min={0} className={input} value={form.max_teachers} onChange={(e) => set("max_teachers", Number(e.target.value))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>{t("mod.subStatus")}</label>
                    <select className={input} value={form.subscription_status} onChange={(e) => set("subscription_status", e.target.value)}>
                      <option value="active">{t("mod.statusActiveHint")}</option>
                      <option value="trial">{t("status.trial")}</option>
                      <option value="expired">{t("status.expired")}</option>
                      <option value="cancelled">{t("status.cancelled")}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* School admin */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("mod.schoolAdminTitle")}</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>{t("mod.firstName")}</label>
                    <input className={input} value={form.admin_first} onChange={(e) => set("admin_first", e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>{t("mod.lastName")}</label>
                    <input className={input} value={form.admin_last} onChange={(e) => set("admin_last", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>{t("mod.emailLogin")}</label>
                    <input type="email" className={input} value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} placeholder="admin@school.edu" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>{t("mod.tempPassword")}</label>
                    <input className={input} value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} placeholder={t("mod.atLeast6")} />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">{t("mod.cancel")}</button>
                <button onClick={submit} disabled={submitting} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40">
                  {submitting ? t("mod.creating") : t("mod.createBtn")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchoolOnboardModal;
