"use client";

import React from "react";

/** Shared "portal" design language used by both the parent (ChildMonitor) and
 *  student dashboards, so the two stay visually consistent. Modelled on the
 *  ProgressBook ParentAccess dashboard: accented panels, a summary stat strip,
 *  attendance ring and alert rows. */

export const PANEL_ACCENTS: Record<string, { chip: string; bar: string }> = {
  indigo: { chip: "bg-indigo-100 text-indigo-600", bar: "from-indigo-500 to-indigo-400" },
  sky: { chip: "bg-sky-100 text-sky-600", bar: "from-sky-500 to-sky-400" },
  amber: { chip: "bg-amber-100 text-amber-600", bar: "from-amber-500 to-amber-400" },
  emerald: { chip: "bg-emerald-100 text-emerald-600", bar: "from-emerald-500 to-emerald-400" },
  purple: { chip: "bg-purple-100 text-purple-600", bar: "from-purple-500 to-purple-400" },
  rose: { chip: "bg-rose-100 text-rose-600", bar: "from-rose-500 to-rose-400" },
};

export type PanelAccent = keyof typeof PANEL_ACCENTS;

export const gradeColor = (pct: number) =>
  pct >= 80 ? "text-green-600" : pct >= 60 ? "text-blue-600" : pct >= 50 ? "text-orange-600" : "text-red-600";

export const gradeBg = (pct: number) =>
  pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 50 ? "bg-orange-500" : "bg-red-500";

export const Panel = ({ title, icon, accent, action, children, className = "" }: {
  title: string;
  icon: string;
  accent: PanelAccent;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    <div className={`h-1 bg-gradient-to-r ${PANEL_ACCENTS[accent].bar}`} />
    <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-50">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${PANEL_ACCENTS[accent].chip}`}>{icon}</span>
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {action && <div className="ml-auto">{action}</div>}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const SUMMARY_ACCENTS: Record<string, string> = {
  emerald: "bg-emerald-50", sky: "bg-sky-50", amber: "bg-amber-50", red: "bg-red-50",
  slate: "bg-slate-50", indigo: "bg-indigo-50", purple: "bg-purple-50",
};

export const SummaryStat = ({ label, value, accent, icon, valueClass = "text-gray-800", hint, size = "text-2xl" }: {
  label: string;
  value: string;
  accent: keyof typeof SUMMARY_ACCENTS;
  icon: string;
  valueClass?: string;
  hint?: string;
  size?: string;
}) => (
  <div className={`rounded-2xl p-3.5 ${SUMMARY_ACCENTS[accent]} border border-black/[0.03]`}>
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <span className="text-sm opacity-70">{icon}</span>
    </div>
    <p className={`${size} font-bold mt-1 truncate ${valueClass}`}>{value}</p>
    {hint && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{hint}</p>}
  </div>
);

const MINI_TONES: Record<string, string> = {
  red: "text-red-600", amber: "text-amber-600", green: "text-green-600", sky: "text-sky-600",
};

export const MiniStat = ({ label, value, tone }: { label: string; value: number; tone: keyof typeof MINI_TONES }) => (
  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
    <p className={`text-lg font-bold leading-none ${MINI_TONES[tone]}`}>{value}</p>
    <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
  </div>
);

export const AttendanceRing = ({ rate }: { rate: number }) => {
  const r = 26, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, rate));
  const color = pct >= 90 ? "#10b981" : pct >= 75 ? "#0ea5e9" : "#f59e0b";
  return (
    <div className="relative w-[68px] h-[68px] shrink-0">
      <svg width="68" height="68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#f1f5f9" strokeWidth="7" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-700">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
};

const ALERT_TONES: Record<string, { box: string; title: string; detail: string; dot: string }> = {
  red: { box: "bg-red-50 border-red-100", title: "text-red-700", detail: "text-red-500", dot: "bg-red-500" },
  orange: { box: "bg-orange-50 border-orange-100", title: "text-orange-700", detail: "text-orange-500", dot: "bg-orange-500" },
  yellow: { box: "bg-yellow-50 border-yellow-100", title: "text-yellow-700", detail: "text-yellow-600", dot: "bg-yellow-500" },
  green: { box: "bg-green-50 border-green-100", title: "text-green-700", detail: "text-green-500", dot: "bg-green-500" },
};

export const AlertRow = ({ tone, title, detail }: { tone: keyof typeof ALERT_TONES; title: string; detail: string }) => {
  const s = ALERT_TONES[tone];
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${s.box}`}>
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
      <div>
        <p className={`text-sm font-medium ${s.title}`}>{title}</p>
        <p className={`text-xs ${s.detail} mt-0.5`}>{detail}</p>
      </div>
    </div>
  );
};

export const EmptyHint = ({ text }: { text: string }) => (
  <p className="text-xs text-gray-400 py-2">{text}</p>
);

/** ProgressBook-style dashboard widget: a blue title bar with an optional
 *  right-aligned action ("details" / back), an optional gray label badge,
 *  then content on a white card with a soft bottom shadow. */
export const PBCard = ({ title, badge, action, children, className = "" }: {
  title: string;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`bg-white rounded-md border border-gray-200 shadow-[0_2px_5px_rgba(0,0,0,0.1)] overflow-hidden ${className}`}>
    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a]">
      <h3 className="text-white font-bold text-base leading-none">{title}</h3>
      {action && <div className="leading-none">{action}</div>}
    </div>
    {badge && (
      <div className="px-4 pt-3">
        <span className="inline-block bg-[#6b7785] text-white text-[11px] font-semibold px-2 py-1 rounded">{badge}</span>
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

export const DetailsLink = ({ onClick, label = "details" }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick} className="text-white/90 hover:text-white text-xs font-medium hover:underline underline-offset-2">
    {label}
  </button>
);
