"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const CURRENCY = { symbol: "$" };
const fmt = (n: number) => `${CURRENCY.symbol}${Math.round(n).toLocaleString("en-US")}`;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
interface StudentFeeRow {
  id: string;
  name: string;
  class: string;
  total: number;
  paid: number;
  lastPayment: string | null;
  guardian: string;
}

interface ChildBreakdown {
  category: string;
  total: number;
  paid: number;
}

interface PaymentHistory {
  id: string;
  date: string;
  amount: number;
  method: string;
  ref: string;
}

type FeeStatus = "paid" | "partial" | "unpaid";

const statusOf = (s: { paid: number; total: number }): FeeStatus => {
  if (s.paid >= s.total) return "paid";
  if (s.paid === 0) return "unpaid";
  return "partial";
};

const statusStyles: Record<FeeStatus, { bg: string; text: string; dot: string; label: string }> = {
  paid: { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-700", label: "Paid in full" },
  partial: { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-600", label: "Partial" },
  unpaid: { bg: "bg-red-50", text: "text-red-800", dot: "bg-red-700", label: "Unpaid" },
};

// ═══════════════════════════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════════════════════════
function StatusPill({ status }: { status: FeeStatus }) {
  const s = statusStyles[status];
  return (
    <span className={`${s.bg} ${s.text} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium`}>
      <span className={`${s.dot} w-1.5 h-1.5 rounded-full`} />
      {s.label}
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-20 h-20 text-2xl" };
  const hue = name.charCodeAt(0) * 7 % 360;
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold shrink-0`}
      style={{ background: `hsl(${hue}, 35%, 92%)`, color: `hsl(${hue}, 50%, 25%)` }}
    >
      {initials}
    </div>
  );
}

function KpiCard({ tone, label, value, sub, icon, accent }: {
  tone: "primary" | "cream" | "white"; label: string; value: string; sub: string; icon: string; accent?: boolean;
}) {
  const tones = {
    primary: "bg-[#0F4F3C] text-white border-transparent",
    cream: "bg-[#F4EFE3] text-[#1A1F1C] border-transparent",
    white: `bg-white text-[#1A1F1C] border-[#E8E2D5] ${accent ? "ring-1 ring-amber-200" : ""}`,
  };
  return (
    <div className={`${tones[tone]} border rounded-2xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] opacity-75 font-medium">{label}</span>
        <span className="opacity-60 text-lg">{icon}</span>
      </div>
      <div className="text-3xl tracking-tight font-serif font-semibold">{value}</div>
      <div className="text-xs opacity-70">{sub}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
const FeesPage = () => {
  const { user } = useAuth();
  const isParent = user?.role === "parent";

  return (
    <div className="flex-1 m-4 mt-0" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#1A1F1C" }}>
      {isParent ? <ParentView /> : <AdminDashboard />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
function AdminDashboard() {
  const { user } = useAuth();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");
  const [statusFilter, setStatusFilter] = useState("All");
  const [students, setStudents] = useState<StudentFeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFees = async () => {
      if (!supabase) { setLoading(false); return; }
      // Fetch students with fee data
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .eq("role", "student")
        .order("first_name");

      if (data) {
        // For now use profiles as student list — in production, join with student_fees view
        setStudents(data.map((s: any) => ({
          id: s.id,
          name: `${s.first_name} ${s.last_name}`,
          class: "—",
          total: 0,
          paid: 0,
          lastPayment: null,
          guardian: "—",
        })));
      }
      setLoading(false);
    };
    fetchFees();
  }, []);

  const classes = ["All classes", ...Array.from(new Set(students.map((s) => s.class).filter(Boolean)))];
  const statuses = ["All", "Paid", "Partial", "Unpaid"];

  const filtered = useMemo(() => students.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (classFilter !== "All classes" && s.class !== classFilter) return false;
    if (statusFilter !== "All" && statusOf(s) !== statusFilter.toLowerCase()) return false;
    return true;
  }), [search, classFilter, statusFilter, students]);

  const totals = useMemo(() => {
    const expected = students.reduce((a, s) => a + s.total, 0);
    const collected = students.reduce((a, s) => a + s.paid, 0);
    const outstanding = expected - collected;
    const rate = expected ? Math.round((collected / expected) * 100) : 0;
    const paidCount = students.filter((s) => statusOf(s) === "paid").length;
    const unpaidCount = students.filter((s) => statusOf(s) === "unpaid").length;
    return { expected, collected, outstanding, rate, paidCount, unpaidCount };
  }, [students]);

  if (loading) return <div className="bg-white p-8 rounded-2xl text-center text-gray-400">Loading fees...</div>;

  return (
    <div>
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Finance · Overview</div>
          <h1 className="text-3xl md:text-4xl tracking-tight font-serif font-semibold">Student Fees</h1>
          <div className="text-sm text-gray-500 mt-1">{user?.schoolName} · {students.length} students enrolled</div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button className="px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center gap-2">
            📥 Export
          </button>
          <button className="px-4 py-2.5 text-sm rounded-xl bg-[#0F4F3C] text-white hover:bg-[#0A3D2E] transition flex items-center gap-2">
            ＋ Record payment
          </button>
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard tone="primary" label="Collected" value={fmt(totals.collected)} sub={`${totals.rate}% of expected`} icon="💰" />
        <KpiCard tone="cream" label="Expected" value={fmt(totals.expected)} sub="This term" icon="📈" />
        <KpiCard tone="white" label="Outstanding" value={fmt(totals.outstanding)} sub={`${totals.unpaidCount} unpaid, ${students.length - totals.paidCount - totals.unpaidCount} partial`} icon="⚠️" accent />
        <KpiCard tone="white" label="Fully paid" value={`${totals.paidCount} / ${students.length}`} sub={`${students.length ? Math.round(totals.paidCount / students.length * 100) : 0}% of students`} icon="✅" />
      </section>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student by name…"
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0F4F3C] transition"
          />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0F4F3C] min-w-[170px]">
          {classes.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0F4F3C] min-w-[130px]">
          {statuses.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>

      {/* Student table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left font-medium px-6 py-4">Student</th>
                <th className="text-left font-medium px-6 py-4 hidden md:table-cell">Class</th>
                <th className="text-right font-medium px-6 py-4">Total fee</th>
                <th className="text-right font-medium px-6 py-4 hidden sm:table-cell">Paid</th>
                <th className="text-right font-medium px-6 py-4">Outstanding</th>
                <th className="text-left font-medium px-6 py-4 hidden lg:table-cell">Status</th>
                <th className="text-left font-medium px-6 py-4 hidden lg:table-cell">Last payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const status = statusOf(s);
                const outstanding = s.total - s.paid;
                const pct = s.total > 0 ? (s.paid / s.total) * 100 : 0;
                return (
                  <tr key={s.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition ${i === filtered.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} />
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-gray-400">{s.id.slice(0, 8)} · {s.guardian}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-gray-500">{s.class}</td>
                    <td className="px-6 py-4 text-right font-mono">{fmt(s.total)}</td>
                    <td className="px-6 py-4 text-right hidden sm:table-cell">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-mono text-emerald-700">{fmt(s.paid)}</span>
                        <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${pct}%`,
                            background: status === "paid" ? "#0F4F3C" : status === "partial" ? "#D97706" : "#B91C1C"
                          }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-mono ${outstanding === 0 ? "text-gray-400" : "font-semibold"}`}>
                        {fmt(outstanding)}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell"><StatusPill status={status} /></td>
                    <td className="px-6 py-4 hidden lg:table-cell text-gray-400 text-xs">
                      {s.lastPayment || <span className="italic">No payment yet</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No students match your filters.</div>
        )}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <span>Showing {filtered.length} of {students.length} students</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PARENT VIEW
// ═══════════════════════════════════════════════════════════════
function ParentView() {
  const { user } = useAuth();
  const supabase = createClient();
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Mock child data — in production, fetch from parent_students + student_fees
  const child = {
    name: user?.firstName ? `${user.firstName} ${user.lastName}` : "Student",
    grade: "—",
    id: user?.profileId?.slice(0, 12) || "—",
    total: 0,
    paid: 0,
    nextDue: "—",
    breakdown: [] as ChildBreakdown[],
    history: [] as PaymentHistory[],
  };

  useEffect(() => {
    const fetchChildFees = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }
      // Fetch linked children
      const { data: links } = await supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", user.profileId);

      if (links && links.length > 0) {
        const studentIds = links.map((l: any) => l.student_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", studentIds);
        if (profiles) setChildren(profiles);
      }
      setLoading(false);
    };
    fetchChildFees();
  }, [user?.profileId]);

  const remaining = child.total - child.paid;
  const pct = child.total > 0 ? (child.paid / child.total) * 100 : 0;

  if (loading) return <div className="bg-white p-8 rounded-2xl text-center text-gray-400">Loading...</div>;

  return (
    <div>
      {/* Greeting */}
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Parent portal</div>
        <h1 className="text-3xl md:text-4xl tracking-tight font-serif font-semibold">
          Hello, {user?.firstName || "Parent"}
        </h1>
        <div className="text-sm text-gray-500 mt-2">
          {children.length > 0
            ? `Fee summary for ${children.length} student${children.length > 1 ? "s" : ""}`
            : "No students linked to your account yet."}
        </div>
      </header>

      {/* Hero: progress ring + totals */}
      <div className="bg-[#0F4F3C] text-white rounded-3xl p-6 md:p-10 mb-6 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(217,119,6,0.15), transparent 70%)" }} />

        <div className="relative grid md:grid-cols-[auto_1fr] gap-8 items-center">
          {/* Progress ring */}
          <div className="relative w-[180px] h-[180px] mx-auto md:mx-0">
            <svg width="180" height="180" className="-rotate-90">
              <circle cx="90" cy="90" r="72" stroke="rgba(255,255,255,0.12)" strokeWidth="12" fill="none" />
              <circle
                cx="90" cy="90" r="72"
                stroke="#F4EFE3" strokeWidth="12" fill="none"
                strokeDasharray={2 * Math.PI * 72}
                strokeDashoffset={2 * Math.PI * 72 - (pct / 100) * 2 * Math.PI * 72}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl tracking-tight font-serif font-semibold">{Math.round(pct)}%</div>
              <div className="text-xs uppercase tracking-widest opacity-70 mt-1">Paid</div>
            </div>
          </div>

          {/* Amounts */}
          <div className="space-y-5">
            {children.length > 0 && (
              <div className="flex items-center gap-3">
                <Avatar name={children[0].first_name + " " + children[0].last_name} size="lg" />
                <div>
                  <div className="text-xl font-serif">{children[0].first_name} {children[0].last_name}</div>
                  <div className="text-sm opacity-70">{child.grade} · {children[0].id.slice(0, 12)}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] opacity-60 mb-1">Total fee</div>
                <div className="text-xl font-serif">{fmt(child.total)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] opacity-60 mb-1">Paid</div>
                <div className="text-xl font-serif text-emerald-200">{fmt(child.paid)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] opacity-60 mb-1">Remaining</div>
                <div className="text-xl font-serif text-amber-300">{fmt(remaining)}</div>
              </div>
            </div>

            {remaining > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button className="flex-1 px-5 py-3 bg-amber-600 hover:bg-amber-700 transition rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  💳 Pay {fmt(remaining)} now
                </button>
                <button className="px-5 py-3 bg-white/10 hover:bg-white/15 transition rounded-xl text-sm flex items-center justify-center gap-2">
                  📥 Statement
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Children list */}
      {children.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-serif font-semibold mb-4">My Children</h2>
          <div className="space-y-3">
            {children.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Avatar name={c.first_name + " " + c.last_name} />
                <div className="flex-1">
                  <div className="font-medium">{c.first_name} {c.last_name}</div>
                  <div className="text-xs text-gray-400">{c.id.slice(0, 12)}</div>
                </div>
                <StatusPill status="unpaid" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help footer */}
      <div className="bg-[#F4EFE3] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
        <span className="text-xl">🛡️</span>
        <div className="flex-1 text-sm">
          <div className="font-medium">Need help with a payment?</div>
          <div className="text-gray-500">Reach the Bursar&apos;s office weekdays 8am–4pm.</div>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-white rounded-lg text-xs flex items-center gap-2 hover:bg-gray-50 transition">
            📞 Call
          </button>
          <button className="px-3 py-2 bg-white rounded-lg text-xs flex items-center gap-2 hover:bg-gray-50 transition">
            ✉️ Email
          </button>
        </div>
      </div>
    </div>
  );
}

export default FeesPage;
