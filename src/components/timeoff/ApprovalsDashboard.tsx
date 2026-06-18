"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import StatusChip from "@/components/timeoff/StatusChip";
import {
  type RequesterKind, type RequestStatus,
  dayCount, formatRange, todayISO, dayInRange, rangesOverlap,
} from "@/lib/timeoff";

interface Person { first_name: string; last_name: string; email: string | null; }
interface Row {
  id: string;
  subject_id: string;
  requester_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: RequestStatus;
  review_note: string | null;
  subject: Person | null;
  requester: Person | null;
}
interface CertRow {
  id: string;
  certification_name: string;
  issuing_org: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  status: RequestStatus;
  review_note: string | null;
  requester: Person | null;
}

const card = "bg-white rounded-xl border shadow-sm";
const approveBtn = "bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const rejectBtn = "bg-white border border-red-300 text-red-600 hover:bg-red-50 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const field = "ring-[1.5px] ring-gray-300 focus:ring-[#4a7eb0] outline-none p-2 rounded-md text-sm";

const name = (p: Person | null) => (p ? `${p.first_name} ${p.last_name}` : "—");
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Tab = "pending" | "approved" | "rejected" | "all" | "cert";

const ApprovalsDashboard = ({ kind }: { kind: RequesterKind }) => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();
  const isStaff = kind === "staff";

  const [rows, setRows] = useState<Row[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [staffDay, setStaffDay] = useState(todayISO());
  const [toast, setToast] = useState("");

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("time_off_requests")
      .select(
        "id, subject_id, requester_id, start_date, end_date, reason, status, review_note, " +
        "subject:profiles!subject_id(first_name,last_name,email), " +
        "requester:profiles!requester_id(first_name,last_name,email)"
      )
      .eq("school_id", user.schoolId)
      .eq("requester_kind", kind)
      .order("start_date", { ascending: true });
    setRows(((data as any[]) || []).map((r) => ({
      ...r, subject: one<Person>(r.subject), requester: one<Person>(r.requester),
    })) as Row[]);

    if (isStaff) {
      const { data: c } = await supabase
        .from("certification_requests")
        .select("id, certification_name, issuing_org, start_date, end_date, notes, status, review_note, " +
          "requester:profiles!requester_id(first_name,last_name,email)")
        .eq("school_id", user.schoolId)
        .order("created_at", { ascending: false });
      setCerts(((c as any[]) || []).map((r) => ({ ...r, requester: one<Person>(r.requester) })) as CertRow[]);
    }
    setLoading(false);
  }, [supabase, user?.schoolId, kind, isStaff]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, status: "approved" | "rejected", note: string) => {
    if (!supabase || !user?.profileId) return;
    const { error } = await supabase
      .from("time_off_requests")
      .update({ status, reviewed_by: user.profileId, reviewed_at: new Date().toISOString(), review_note: note || null })
      .eq("id", id);
    if (error) { flash(t("timeoff.errorPrefix", { message: error.message })); return; }
    if (status === "approved") {
      // Fire the approval email; the approval stands regardless of delivery.
      try {
        const res = await fetch("/api/timeoff/notify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: id }),
        });
        const json = await res.json().catch(() => ({}));
        flash(json?.sent ? t("timeoff.emailSent") : t("timeoff.emailQueued"));
      } catch {
        flash(t("timeoff.emailQueued"));
      }
    } else {
      flash(t("timeoff.rejectedToast"));
    }
    load();
  };

  const reviewCert = async (id: string, status: "approved" | "rejected", note: string) => {
    if (!supabase || !user?.profileId) return;
    const { error } = await supabase
      .from("certification_requests")
      .update({ status, reviewed_by: user.profileId, reviewed_at: new Date().toISOString(), review_note: note || null })
      .eq("id", id);
    if (error) { flash(t("timeoff.errorPrefix", { message: error.message })); return; }
    flash(status === "approved" ? t("timeoff.approvedToast") : t("timeoff.rejectedToast"));
    load();
  };

  // Approved requests overlapping the chosen staffing day.
  const offThatDay = useMemo(
    () => rows.filter((r) => r.status === "approved" && dayInRange(staffDay, r.start_date, r.end_date)),
    [rows, staffDay]
  );

  // For a pending row, how many OTHER approved requests overlap its range.
  const overlapCount = useCallback(
    (row: Row) => rows.filter((r) =>
      r.id !== row.id && r.status === "approved" && rangesOverlap(row.start_date, row.end_date, r.start_date, r.end_date)
    ).length,
    [rows]
  );

  const visible = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "cert") return rows; // unused for cert tab
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);

  const tabs: { id: Tab; key: string; show: boolean }[] = [
    { id: "pending", key: "timeoff.pendingTab", show: true },
    { id: "approved", key: "timeoff.approvedTab", show: true },
    { id: "rejected", key: "timeoff.rejectedTab", show: true },
    { id: "all", key: "timeoff.allTab", show: true },
    { id: "cert", key: "timeoff.certTab", show: isStaff },
  ];

  return (
    <div className="p-4 flex flex-col gap-6">
      <div className={`${card} p-6`}>
        <h1 className="text-xl font-semibold">{t(isStaff ? "timeoff.staffApprovals" : "timeoff.studentApprovals")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t(isStaff ? "timeoff.staffApprovalsSub" : "timeoff.studentApprovalsSub")}</p>
      </div>

      {toast && (
        <div className="rounded-md bg-emerald-50 text-emerald-800 text-sm px-4 py-2 border border-emerald-200">{toast}</div>
      )}

      {/* Real-time staffing / attendance visibility */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-800">{t("timeoff.staffingTitle")}</h2>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            {t("timeoff.pickDate")}
            <input type="date" className={field} value={staffDay} onChange={(e) => setStaffDay(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center rounded-full w-10 h-10 text-lg font-bold"
            style={{ background: offThatDay.length ? "#fff7ed" : "#ecfdf5", color: offThatDay.length ? "#9a3412" : "#065f46" }}
          >
            {offThatDay.length}
          </span>
          <div>
            <p className="text-sm font-medium text-gray-800">
              {offThatDay.length ? t("timeoff.peopleOff", { n: offThatDay.length }) : t("timeoff.noneOff")}
            </p>
            <p className="text-xs text-gray-500">{t("timeoff.offOn", { date: formatRange(staffDay, staffDay, locale) })}</p>
          </div>
        </div>
        {offThatDay.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {offThatDay.map((r) => (
              <span key={r.id} className="text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
                {name(r.subject)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto bg-white p-1.5 rounded-xl border shadow-sm">
        {tabs.filter((tb) => tb.show).map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`text-sm font-medium px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
              tab === tb.id ? "bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t(tb.key)}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className={`${card} p-6 text-sm text-gray-400`}>{t("ui.loading")}</div>
      ) : tab === "cert" ? (
        <CertList certs={certs} onReview={reviewCert} />
      ) : visible.length === 0 ? (
        <div className={`${card} p-6 text-sm text-gray-400`}>{t("timeoff.nothingHere")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <RequestRow
              key={r.id}
              row={r}
              overlap={overlapCount(r)}
              onReview={review}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Single time-off request row ──────────────────────────────────── */
const RequestRow = ({
  row, overlap, onReview,
}: {
  row: Row;
  overlap: number;
  onReview: (id: string, status: "approved" | "rejected", note: string) => void;
}) => {
  const { t, locale } = useI18n();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "approved" | "rejected">("");
  const viaParent = row.requester_id !== row.subject_id;

  const act = async (status: "approved" | "rejected") => {
    setBusy(status);
    await onReview(row.id, status, note);
    setBusy("");
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">{name(row.subject)}</p>
          {viaParent && <p className="text-xs text-gray-400">via {name(row.requester)}</p>}
          <p className="text-sm text-gray-600 mt-1">
            {formatRange(row.start_date, row.end_date, locale)}
            <span className="text-gray-400"> · {t("timeoff.duration", { n: dayCount(row.start_date, row.end_date) })}</span>
          </p>
          {row.reason && <p className="text-sm text-gray-500 mt-1">{row.reason}</p>}
          {overlap > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 inline-block rounded px-2 py-0.5 mt-2">
              ⚠ {t("timeoff.overlapWarn", { n: overlap })}
            </p>
          )}
        </div>
        <StatusChip status={row.status} />
      </div>

      {row.status === "pending" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            className={`${field} flex-1 min-w-[180px]`}
            placeholder={t("timeoff.reviewNote")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className={approveBtn} disabled={!!busy} onClick={() => act("approved")}>
            {busy === "approved" ? t("timeoff.approving") : `✓ ${t("timeoff.approve")}`}
          </button>
          <button className={rejectBtn} disabled={!!busy} onClick={() => act("rejected")}>
            {busy === "rejected" ? t("timeoff.rejecting") : `✕ ${t("timeoff.reject")}`}
          </button>
        </div>
      )}
      {row.status !== "pending" && row.review_note && (
        <p className="text-xs text-gray-400 mt-2 italic">“{row.review_note}”</p>
      )}
    </div>
  );
};

/* ── Certification list (staff approvals only) ────────────────────── */
const CertList = ({
  certs, onReview,
}: {
  certs: CertRow[];
  onReview: (id: string, status: "approved" | "rejected", note: string) => void;
}) => {
  const { t, locale } = useI18n();
  if (certs.length === 0) return <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-400">{t("timeoff.nothingHere")}</div>;
  return (
    <div className="flex flex-col gap-3">
      {certs.map((c) => <CertRowItem key={c.id} cert={c} onReview={onReview} />)}
    </div>
  );
};

const CertRowItem = ({
  cert, onReview,
}: {
  cert: CertRow;
  onReview: (id: string, status: "approved" | "rejected", note: string) => void;
}) => {
  const { t, locale } = useI18n();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "approved" | "rejected">("");
  const act = async (s: "approved" | "rejected") => { setBusy(s); await onReview(cert.id, s, note); setBusy(""); };
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">{cert.certification_name}</p>
          <p className="text-xs text-gray-400">{name(cert.requester)}</p>
          <p className="text-sm text-gray-500 mt-1">
            {[cert.issuing_org, cert.start_date && cert.end_date ? formatRange(cert.start_date, cert.end_date, locale) : null]
              .filter(Boolean).join(" · ")}
          </p>
          {cert.notes && <p className="text-sm text-gray-500 mt-1">{cert.notes}</p>}
        </div>
        <StatusChip status={cert.status} />
      </div>
      {cert.status === "pending" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input className={`${field} flex-1 min-w-[180px]`} placeholder={t("timeoff.reviewNote")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={approveBtn} disabled={!!busy} onClick={() => act("approved")}>
            {busy === "approved" ? t("timeoff.approving") : `✓ ${t("timeoff.approve")}`}
          </button>
          <button className={rejectBtn} disabled={!!busy} onClick={() => act("rejected")}>
            {busy === "rejected" ? t("timeoff.rejecting") : `✕ ${t("timeoff.reject")}`}
          </button>
        </div>
      )}
      {cert.status !== "pending" && cert.review_note && (
        <p className="text-xs text-gray-400 mt-2 italic">“{cert.review_note}”</p>
      )}
    </div>
  );
};

export default ApprovalsDashboard;
