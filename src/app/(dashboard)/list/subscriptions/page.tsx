"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

type SchoolRow = {
  id: string;
  name: string;
  type: string;
  subscription_status: string;
  subscription_plan: string | null;
  max_students: number;
  max_teachers: number;
  created_at: string;
};

const STATUS_PILL: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trial: "bg-blue-100 text-blue-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const STATUSES = ["active", "trial", "expired", "cancelled"];

const SubscriptionsPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const isPlatform = role === "platform_admin";
  const supabase = createClient();

  const [data, setData] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data: rows } = await supabase
      .from("schools")
      .select("id, name, type, subscription_status, subscription_plan, max_students, max_teachers, created_at")
      .order("name", { ascending: true });
    setData((rows as SchoolRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    if (!supabase) return;
    setData((prev) => prev.map((s) => (s.id === id ? { ...s, subscription_status: status } : s)));
    await supabase.from("schools").update({ subscription_status: status }).eq("id", id);
  };

  const stats = useMemo(() => {
    const total = data.length;
    const count = (s: string) => data.filter((d) => d.subscription_status === s).length;
    return { total, active: count("active"), trial: count("trial"), expired: count("expired") + count("cancelled") };
  }, [data]);

  if (role && role !== "platform_admin") {
    return (
      <div className="bg-white p-8 rounded-md flex-1 m-4 mt-0 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-gray-600 text-sm">Subscription management is available to platform administrators only.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">Loading subscriptions...</div>;
  }

  return (
    <div className="flex-1 m-4 mt-0 flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total Schools</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">On Trial</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.trial}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Expired</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.expired}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-md">
        <h1 className="text-lg font-semibold mb-1">Subscriptions</h1>
        <p className="text-xs text-gray-400 mb-4">Authorize (set to <span className="font-medium text-green-600">active</span>) to let a school admin add teachers, students and parents.</p>
        {data.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-2">💳</div>
            <p className="text-gray-500 text-sm">No subscriptions to display.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.map((s) => (
              <div key={s.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{s.type} school</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${STATUS_PILL[s.subscription_status] || "bg-gray-100 text-gray-600"}`}>
                    {s.subscription_status}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Plan</span>
                    <span className="text-gray-700 font-medium">{s.subscription_plan || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Student cap</span>
                    <span className="text-gray-700 font-medium">{s.max_students}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Staff cap</span>
                    <span className="text-gray-700 font-medium">{s.max_teachers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Since</span>
                    <span className="text-gray-700 font-medium">{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {isPlatform && (
                  <div className="mt-3 pt-3 border-t">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">Authorization</label>
                    <select
                      value={s.subscription_status}
                      onChange={(e) => updateStatus(s.id, e.target.value)}
                      className="mt-1 w-full text-sm px-3 py-2 rounded-lg border capitalize focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionsPage;
