// Shared types + helpers for the time-off / certification approval suite.

export type RequestStatus = "pending" | "approved" | "rejected";
export type RequesterKind = "staff" | "student";

export interface TimeOffRequest {
  id: string;
  school_id: string;
  requester_id: string;
  subject_id: string;
  requester_kind: RequesterKind;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  reason: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface CertificationRequest {
  id: string;
  school_id: string;
  requester_id: string;
  certification_name: string;
  issuing_org: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

/** Inclusive whole-day count between two YYYY-MM-DD dates. */
export function dayCount(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const ms = e.getTime() - s.getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

/** Does [aStart,aEnd] overlap [bStart,bEnd]? All inclusive YYYY-MM-DD. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Is `day` (YYYY-MM-DD) within [start,end] inclusive? */
export function dayInRange(day: string, start: string, end: string): boolean {
  return start <= day && day <= end;
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** Material-styled status chip palette. */
export const STATUS_STYLE: Record<RequestStatus, { bg: string; text: string; dot: string; labelKey: string }> = {
  pending:  { bg: "#fff7ed", text: "#9a3412", dot: "#f59e0b", labelKey: "timeoff.status.pending" },
  approved: { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", labelKey: "timeoff.status.approved" },
  rejected: { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444", labelKey: "timeoff.status.rejected" },
};

/** Format a YYYY-MM-DD range for display in the active locale. */
export function formatRange(start: string, end: string, locale = "en"): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}
