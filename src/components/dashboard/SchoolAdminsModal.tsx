"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SchoolAdminsModalProps {
  schoolId: string;
  schoolName: string;
  onClose: () => void;
}

interface AdminRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
}

/** Platform-admin tool to edit a school's administrator account or suspend
 *  it (e.g. on non-payment). Backed by the update_school_admin RPC. */
const SchoolAdminsModal = ({ schoolId, schoolName, onClose }: SchoolAdminsModalProps) => {
  const supabase = createClient();

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "" });

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, is_active")
      .eq("school_id", schoolId)
      .eq("role", "school_admin")
      .order("first_name", { ascending: true });
    setAdmins((data as AdminRow[]) || []);
    setLoading(false);
  }, [supabase, schoolId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (a: AdminRow) => {
    setEditingId(a.id);
    setError(null);
    setForm({ first_name: a.first_name, last_name: a.last_name, email: a.email, password: "" });
  };

  const saveEdit = async (a: AdminRow) => {
    if (!supabase) return;
    setError(null);
    setBusyId(a.id);
    const { data, error: rpcErr } = await supabase.rpc("update_school_admin", {
      p_profile_id: a.id,
      p_first: form.first_name.trim() || null,
      p_last: form.last_name.trim() || null,
      p_email: form.email.trim() || null,
      p_password: form.password.trim() || null,
    });
    setBusyId(null);
    if (rpcErr) { setError(rpcErr.message); return; }
    if (data?.error) { setError(data.error); return; }
    setEditingId(null);
    await load();
  };

  const remove = async (a: AdminRow) => {
    if (!supabase) return;
    setError(null);
    setBusyId(a.id);
    const { data, error: rpcErr } = await supabase.rpc("delete_school_admin", { p_profile_id: a.id });
    setBusyId(null);
    if (rpcErr) { setError(rpcErr.message); return; }
    if (data?.error) { setError(data.error); return; }
    setConfirmDeleteId(null);
    await load();
  };

  const toggleActive = async (a: AdminRow) => {
    if (!supabase) return;
    setError(null);
    setBusyId(a.id);
    const { data, error: rpcErr } = await supabase.rpc("update_school_admin", {
      p_profile_id: a.id,
      p_is_active: !a.is_active,
    });
    setBusyId(null);
    if (rpcErr) { setError(rpcErr.message); return; }
    if (data?.error) { setError(data.error); return; }
    setConfirmSuspendId(null);
    await load();
  };

  const input ="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200";
  const label = "text-[10px] text-gray-400 uppercase tracking-wide";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold">School Administrator</h2>
            <p className="text-xs text-gray-400">{schoolName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
          ) : admins.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No administrator on this school yet.</p>
          ) : (
            admins.map((a) => (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${a.is_active ? "bg-gradient-to-br from-blue-500 to-indigo-600" : "bg-gray-400"}`}>
                      {a.first_name?.[0]}{a.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.first_name} {a.last_name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.email}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${a.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {a.is_active ? "Active" : "Suspended"}
                  </span>
                </div>

                {editingId === a.id ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={label}>First name</label>
                        <input className={input} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className={label}>Last name</label>
                        <input className={input} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className={label}>Email (login)</label>
                      <input className={input} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className={label}>New password (optional)</label>
                      <input className={input} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setEditingId(null)} className="text-sm px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button onClick={() => saveEdit(a)} disabled={busyId === a.id} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40">
                        {busyId === a.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : confirmDeleteId === a.id ? (
                  <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-2.5">
                    <p className="text-xs text-red-700 font-medium">Permanently delete this administrator?</p>
                    <p className="text-[11px] text-red-500 mt-0.5">This removes their login for good and cannot be undone. Use “Suspend” if you only want to block access temporarily.</p>
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button
                        onClick={() => remove(a)}
                        disabled={busyId === a.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        {busyId === a.id ? "Deleting..." : "Delete permanently"}
                      </button>
                    </div>
                  </div>
                ) : confirmSuspendId === a.id ? (
                  <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                    <p className="text-xs text-amber-700 font-medium">Suspend the entire school?</p>
                    <p className="text-[11px] text-amber-600 mt-0.5">All teachers, students and parents will be locked out of sign-in until you reactivate. The admin&apos;s data is kept.</p>
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setConfirmSuspendId(null)} className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button
                        onClick={() => toggleActive(a)}
                        disabled={busyId === a.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
                      >
                        {busyId === a.id ? "Suspending..." : "Suspend school"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => startEdit(a)} className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50">Edit</button>
                    <button
                      onClick={() => (a.is_active ? setConfirmSuspendId(a.id) : toggleActive(a))}
                      disabled={busyId === a.id}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 ${a.is_active ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}
                    >
                      {busyId === a.id ? "..." : a.is_active ? "Suspend" : "Reactivate"}
                    </button>
                    <button
                      onClick={() => { setConfirmDeleteId(a.id); setError(null); }}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          <p className="text-[11px] text-gray-400 pt-1">
            <span className="font-medium text-amber-600">Suspend</span> locks the <span className="font-medium">entire school</span> out of sign-in — teachers, students and parents included (reversible; use while payment is pending).
            {" "}<span className="font-medium text-red-600">Delete</span> permanently removes the admin login (use when a school refuses to pay).
          </p>
        </div>
      </div>
    </div>
  );
};

export default SchoolAdminsModal;
