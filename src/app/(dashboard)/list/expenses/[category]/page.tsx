"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import {
  isExpenseCategory,
  labelForCategory,
  tLabelForCategory,
  type ExpenseCategoryKey,
} from "@/lib/expenseCategories";

interface ExpenseRow {
  id: string;
  category: string;
  title: string;
  amount: number;
  vendor: string | null;
  paid_at: string | null;
  status: "paid" | "pending" | "overdue";
  notes: string | null;
  created_at: string;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Generic expense ledger page driven by the [category] URL slug. Used for
 *  every non-Payroll bucket under the new Expenses sidebar dropdown
 *  (Facilities, Utilities, Academic Materials, Technology, Transportation,
 *  Food Services, Security, Administration, Marketing, Events, Insurance,
 *  Capital Expenses). Admin can add, edit and delete entries with title,
 *  amount, vendor, paid date, status and notes. */
const ExpenseCategoryPage = () => {
  const params = useParams<{ category: string }>();
  const searchParams = useSearchParams();
  const slug = params?.category || "";
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  // Hooks must run in the same order on every render, so DON'T short-circuit
  // with notFound() before the hooks below — call it from an effect after
  // they've all been declared.
  const validCategory = isExpenseCategory(slug);
  const category = (validCategory ? slug : "facilities") as ExpenseCategoryKey;
  // English label kept for logic (e.g. the Utilities placeholder check);
  // `label` is the translated label used everywhere it's shown to the user.
  const enLabel = labelForCategory(category);
  const label = tLabelForCategory(t, category);

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canEdit = user?.role === "school_admin" || user?.role === "platform_admin";

  const load = async () => {
    if (!supabase || !user?.schoolId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("expenses")
      .select("id, category, title, amount, vendor, paid_at, status, notes, created_at")
      .eq("school_id", user.schoolId)
      .eq("category", category)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setRows((data as ExpenseRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!validCategory) { notFound(); return; }
    load();
  }, [user?.schoolId, category, validCategory]);

  // Sidebar line items navigate here with ?item=<line item> so the admin
  // sees the Add form already opened with the right title; drop the param
  // off the URL once we've consumed it so a page refresh doesn't re-open it.
  const prefillTitle = searchParams?.get("item") || "";
  useEffect(() => {
    if (prefillTitle) {
      setCreating(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("item");
      window.history.replaceState({}, "", url.toString());
    }
  }, [prefillTitle]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const paid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const pending = rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0);
    const overdue = rows.filter((r) => r.status === "overdue").reduce((s, r) => s + r.amount, 0);
    return { total, paid, pending, overdue, count: rows.length };
  }, [rows]);

  // Bail out AFTER every hook has run so the hook count stays the same on
  // every render — invalid slugs trigger notFound() from the effect above.
  if (!validCategory) return null;

  const remove = async (id: string) => {
    if (!supabase) return;
    if (!confirm(t("exp.deleteConfirm"))) return;
    setBusyId(id);
    try {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(t("exp.errorPrefix", { message: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 m-4 mt-0 flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-md border border-gray-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">{t("exp.expenses")}</p>
          <h1 className="text-lg font-semibold text-gray-800">{label}</h1>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-sm rounded-md bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white font-medium hover:opacity-95"
          >
            {t("exp.addExpensePlus")}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("exp.total")} value={fmt(totals.total)} sub={totals.count === 1 ? t("exp.record", { n: totals.count }) : t("exp.records", { n: totals.count })} />
        <Stat label={t("exp.paid")} value={fmt(totals.paid)} tone="text-green-600" />
        <Stat label={t("exp.pending")} value={fmt(totals.pending)} tone="text-amber-600" />
        <Stat label={t("exp.overdue")} value={fmt(totals.overdue)} tone="text-red-600" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">{t("exp.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {t("exp.noExpensesYet", { label: label.toLowerCase() })}
            {canEdit && t("exp.clickToRecord")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#eef3f7] text-gray-600 text-xs">
                <th className="text-left font-semibold px-4 py-2">{t("exp.title")}</th>
                <th className="text-left font-semibold px-4 py-2 hidden md:table-cell">{t("exp.vendor")}</th>
                <th className="text-right font-semibold px-4 py-2">{t("exp.amount")}</th>
                <th className="text-left font-semibold px-4 py-2 hidden md:table-cell">{t("exp.paidOn")}</th>
                <th className="text-left font-semibold px-4 py-2">{t("exp.status")}</th>
                {canEdit && <th className="text-right font-semibold px-4 py-2">{t("exp.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800">{r.title}</p>
                    {r.notes && <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[260px]">{r.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-gray-600">{r.vendor || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmt(r.amount)}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-gray-500 text-xs">
                    {r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={r.status} />
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setEditing(r)} className="text-[11px] text-[#2f6da3] hover:underline">{t("exp.edit")}</button>
                        <button
                          onClick={() => remove(r.id)}
                          disabled={busyId === r.id}
                          className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
                        >
                          {t("exp.delete")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <ExpenseForm
          category={category}
          label={label}
          enLabel={enLabel}
          existing={editing}
          defaultTitle={creating && !editing ? prefillTitle : ""}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
};

const Stat = ({ label, value, sub, tone = "text-gray-800" }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className="bg-white rounded-md border border-gray-200 p-3">
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-lg font-bold mt-0.5 truncate ${tone}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const StatusPill = ({ status }: { status: ExpenseRow["status"] }) => {
  const { t } = useI18n();
  const styles: Record<ExpenseRow["status"], string> = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    overdue: "bg-red-100 text-red-700",
  };
  const labels: Record<ExpenseRow["status"], string> = {
    paid: t("exp.statusPaid"),
    pending: t("exp.statusPending"),
    overdue: t("exp.statusOverdue"),
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

/* ── Add / edit form ─────────────────────────────────────────────────── */

function ExpenseForm({
  category, label, enLabel, existing, defaultTitle = "", onClose, onSaved,
}: {
  category: ExpenseCategoryKey;
  label: string;
  enLabel: string;
  existing: ExpenseRow | null;
  defaultTitle?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [title, setTitle] = useState(existing?.title || defaultTitle || "");
  const [amount, setAmount] = useState(String(existing?.amount ?? "0"));
  const [vendor, setVendor] = useState(existing?.vendor || "");
  const [paidAt, setPaidAt] = useState(existing?.paid_at?.slice(0, 10) || todayIso());
  const [status, setStatus] = useState<ExpenseRow["status"]>(existing?.status || "paid");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user?.schoolId) return;
    if (!title.trim()) { setError(t("exp.titleRequired")); return; }
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt < 0) { setError(t("exp.amountMin")); return; }
    setSaving(true);
    setError("");
    try {
      // Only persist paid_at for paid rows; pending / overdue records should
      // not carry a payment date.
      const payload = {
        school_id: user.schoolId,
        category,
        title: title.trim(),
        amount: amt,
        vendor: vendor.trim() || null,
        paid_at: status === "paid" ? (paidAt || null) : null,
        status,
        notes: notes.trim() || null,
      };
      if (existing) {
        const { error: e1 } = await supabase.from("expenses").update(payload).eq("id", existing.id);
        if (e1) throw e1;
      } else {
        const { error: e1 } = await supabase.from("expenses").insert({ ...payload, created_by: user.profileId });
        if (e1) throw e1;
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || t("exp.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{existing ? t("exp.editTitle", { label: label.toLowerCase() }) : t("exp.addTitle", { label: label.toLowerCase() })}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-gray-500">
          {t("exp.title")}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("exp.titlePlaceholder", { example: enLabel === "Utilities" ? t("exp.utilitiesExample") : t("exp.genericExample") })}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-gray-500">
            {t("exp.amount")}
            <input
              type="number" min="0" step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-gray-500">
            {t("exp.vendorOptional")}
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-gray-500">
            {t("exp.paidOn")}
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-gray-500">
            {t("exp.status")}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ExpenseRow["status"])}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            >
              <option value="paid">{t("exp.statusPaid")}</option>
              <option value="pending">{t("exp.statusPending")}</option>
              <option value="overdue">{t("exp.statusOverdue")}</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-gray-500">
          {t("exp.notesOptional")}
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
          />
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-200 text-sm">{t("exp.cancel")}</button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? t("exp.saving") : existing ? t("exp.saveChanges") : t("exp.addExpense")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ExpenseCategoryPage;
