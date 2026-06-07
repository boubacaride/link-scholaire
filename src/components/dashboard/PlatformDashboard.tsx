"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface SchoolRow {
  id: string;
  name: string;
  type: string;
  subscription_status: string;
  subscription_plan: string | null;
  access_suspended: boolean;
  created_at: string;
}

const STATUS_PILL: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trial: "bg-blue-100 text-blue-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

/** Tenant-layer overview for the platform admin. Shows only schools and their
 *  subscriptions — never any school's internal members. */
const PlatformDashboard = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase) { setLoading(false); return; }
      const { data } = await supabase
        .from("schools")
        .select("id, name, type, subscription_status, subscription_plan, access_suspended, created_at")
        .order("created_at", { ascending: false });
      setSchools((data as SchoolRow[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const stats = useMemo(() => {
    // Exclude the platform's own org school from tenant counts
    const tenants = schools.filter((s) => s.subscription_plan !== "platform");
    const count = (s: string) => tenants.filter((t) => t.subscription_status === s).length;
    const suspended = tenants.filter((t) => t.access_suspended).length;
    return { total: tenants.length, active: count("active"), trial: count("trial"), suspended };
  }, [schools]);

  const tenantSchools = useMemo(
    () => schools.filter((s) => s.subscription_plan !== "platform"),
    [schools]
  );

  return (
    <div className="p-4 flex flex-col gap-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">{t("platform.consoleTitle")}</h1>
        <p className="text-indigo-100 text-sm">
          {t("platform.consoleSubtitle", { name: user?.firstName || "Platform Admin" })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t("platform.kpiSchools")}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{loading ? "—" : stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t("platform.kpiActive")}</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{loading ? "—" : stats.active}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t("platform.kpiTrial")}</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{loading ? "—" : stats.trial}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t("platform.kpiSuspended")}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{loading ? "—" : stats.suspended}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/list/schools" className="bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
          {t("platform.manageSchools")}
        </Link>
        <Link href="/list/subscriptions" className="bg-white border text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
          {t("platform.subscriptions")}
        </Link>
      </div>

      {/* Recent tenants */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("platform.recentSchools")}</h2>
          <Link href="/list/schools" className="text-xs text-blue-600 font-medium">{t("common.viewAll")}</Link>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">{t("common.loading")}</div>
        ) : tenantSchools.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-2">🏫</div>
            <p className="text-gray-500 text-sm">{t("platform.noSchools")}</p>
            <p className="text-gray-400 text-xs mt-1">{t("platform.noSchoolsHint")}</p>
          </div>
        ) : (
          <div className="divide-y">
            {tenantSchools.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {s.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{s.type} · {s.subscription_plan || t("platform.noPlan")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.access_suspended && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">{t("platform.locked")}</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${STATUS_PILL[s.subscription_status] || "bg-gray-100 text-gray-600"}`}>
                    {s.subscription_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformDashboard;
