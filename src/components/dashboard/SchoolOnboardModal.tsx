"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SchoolOnboardModalProps {
  onClose: () => void;
  onCreated: () => void;
}

/** Platform-admin flow: create a school + its subscription + the first
 *  school admin in a single atomic call (create_school_with_admin RPC). */
const SchoolOnboardModal = ({ onClose, onCreated }: SchoolOnboardModalProps) => {
  const supabase = createClient();

  const [form, setForm] = useState({
    school_name: "",
    school_type: "private",
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
          <h2 className="text-lg font-semibold">Onboard a School</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          {success ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-green-700 font-medium">School created!</p>
              <p className="text-gray-500 text-sm mt-1">The school admin can now sign in with the email and password you set.</p>
            </div>
          ) : (
            <>
              {/* School details */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">School details</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className={label}>School name</label>
                    <input className={input} value={form.school_name} onChange={(e) => set("school_name", e.target.value)} placeholder="Lincoln Academy" />
                  </div>
                  <div>
                    <label className={label}>Type</label>
                    <select className={input} value={form.school_type} onChange={(e) => set("school_type", e.target.value)}>
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Plan</label>
                    <input className={input} value={form.plan} onChange={(e) => set("plan", e.target.value)} placeholder="standard / premium" />
                  </div>
                  <div>
                    <label className={label}>Max students</label>
                    <input type="number" min={0} className={input} value={form.max_students} onChange={(e) => set("max_students", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={label}>Max staff</label>
                    <input type="number" min={0} className={input} value={form.max_teachers} onChange={(e) => set("max_teachers", Number(e.target.value))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>Subscription status</label>
                    <select className={input} value={form.subscription_status} onChange={(e) => set("subscription_status", e.target.value)}>
                      <option value="active">Active (authorized — admin can add users)</option>
                      <option value="trial">Trial</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* School admin */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">School administrator</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>First name</label>
                    <input className={input} value={form.admin_first} onChange={(e) => set("admin_first", e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Last name</label>
                    <input className={input} value={form.admin_last} onChange={(e) => set("admin_last", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>Email (login)</label>
                    <input type="email" className={input} value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} placeholder="admin@school.edu" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label}>Temporary password</label>
                    <input className={input} value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} placeholder="At least 6 characters" />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={submit} disabled={submitting} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40">
                  {submitting ? "Creating..." : "Create school & admin"}
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
