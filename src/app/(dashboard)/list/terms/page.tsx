"use client";

// Academic Calendar admin page — school_admin manages academic years
// and grading terms here. The Report Cards page reads from these two
// tables; without at least one year and one term, the pickers stay
// empty and the generator can't run.
//
// Workflow:
//   1. Create an academic year (e.g. "2025-2026") and mark one active.
//   2. Inside that year, create the grading terms (Q1, Q2, …) with
//      sequence + start/end dates.
//   3. Once all grades are entered for a term, flip is_locked to true
//      — that freezes grade edits (DB trigger) and unblocks the report
//      card generator.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Term {
  id: string;
  academic_year_id: string;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  is_locked: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const TermsPage = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Forms ──
  const [yearForm, setYearForm] = useState({
    name: "", start_date: "", end_date: "", is_active: false,
  });
  const [termForm, setTermForm] = useState({
    name: "", sequence: 1, start_date: "", end_date: "", is_locked: false,
  });
  const [savingYear, setSavingYear] = useState(false);
  const [savingTerm, setSavingTerm] = useState(false);

  // ── Load years (+ refresh) ──
  const loadYears = useCallback(async () => {
    if (!supabase || !user?.schoolId) return;
    const { data, error: err } = await supabase
      .from("academic_years")
      .select("id, name, start_date, end_date, is_active")
      .eq("school_id", user.schoolId)
      .order("start_date", { ascending: false });
    if (err) { setError(err.message); return; }
    setYears(data ?? []);
    // Preserve the user's pick across refreshes when possible.
    setSelectedYearId((prev) => {
      if (prev && (data ?? []).some((y) => y.id === prev)) return prev;
      return (data ?? []).find((y) => y.is_active)?.id ?? data?.[0]?.id ?? "";
    });
    setLoading(false);
  }, [user?.schoolId]);

  useEffect(() => { loadYears(); }, [loadYears]);

  // ── Load terms for the selected year ──
  const loadTerms = useCallback(async () => {
    if (!supabase || !selectedYearId) { setTerms([]); return; }
    const { data, error: err } = await supabase
      .from("terms")
      .select("id, academic_year_id, name, sequence, start_date, end_date, is_locked")
      .eq("academic_year_id", selectedYearId)
      .order("sequence", { ascending: true });
    if (err) { setError(err.message); return; }
    setTerms(data ?? []);
  }, [selectedYearId]);

  useEffect(() => { loadTerms(); }, [loadTerms]);

  const selectedYear = useMemo(
    () => years.find((y) => y.id === selectedYearId) ?? null,
    [years, selectedYearId],
  );

  // ── Year CRUD ──
  const createYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user?.schoolId) return;
    setError(null);
    if (!yearForm.name.trim() || !yearForm.start_date || !yearForm.end_date) {
      setError("Name, start date and end date are required.");
      return;
    }
    setSavingYear(true);
    // Active-year uniqueness is enforced application-side: flipping one
    // active means clearing the others.
    if (yearForm.is_active && years.length > 0) {
      await supabase
        .from("academic_years")
        .update({ is_active: false })
        .eq("school_id", user.schoolId);
    }
    const { error: insErr, data } = await supabase
      .from("academic_years")
      .insert({
        school_id: user.schoolId,
        name: yearForm.name.trim(),
        start_date: yearForm.start_date,
        end_date: yearForm.end_date,
        is_active: yearForm.is_active,
      })
      .select("id")
      .single();
    setSavingYear(false);
    if (insErr) { setError(insErr.message); return; }
    setYearForm({ name: "", start_date: "", end_date: "", is_active: false });
    await loadYears();
    if (data?.id) setSelectedYearId(data.id);
  };

  const toggleYearActive = async (y: AcademicYear) => {
    if (!supabase || !user?.schoolId) return;
    const becomingActive = !y.is_active;
    if (becomingActive) {
      await supabase
        .from("academic_years")
        .update({ is_active: false })
        .eq("school_id", user.schoolId);
    }
    await supabase
      .from("academic_years")
      .update({ is_active: becomingActive })
      .eq("id", y.id);
    loadYears();
  };

  const deleteYear = async (y: AcademicYear) => {
    if (!supabase) return;
    if (!window.confirm(
      `Delete academic year "${y.name}"? All terms inside it will also be deleted.`,
    )) return;
    const { error: err } = await supabase.from("academic_years").delete().eq("id", y.id);
    if (err) { setError(err.message); return; }
    loadYears();
  };

  // ── Term CRUD ──
  const createTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedYearId) return;
    setError(null);
    if (!termForm.name.trim() || !termForm.start_date || !termForm.end_date) {
      setError("Name, start date and end date are required.");
      return;
    }
    setSavingTerm(true);
    const { error: insErr } = await supabase
      .from("terms")
      .insert({
        academic_year_id: selectedYearId,
        name: termForm.name.trim(),
        sequence: termForm.sequence,
        start_date: termForm.start_date,
        end_date: termForm.end_date,
        is_locked: termForm.is_locked,
      });
    setSavingTerm(false);
    if (insErr) { setError(insErr.message); return; }
    setTermForm({
      name: "", sequence: (termForm.sequence || 0) + 1,
      start_date: "", end_date: "", is_locked: false,
    });
    loadTerms();
  };

  const toggleTermLock = async (t: Term) => {
    if (!supabase) return;
    const { error: err } = await supabase
      .from("terms")
      .update({ is_locked: !t.is_locked })
      .eq("id", t.id);
    if (err) { setError(err.message); return; }
    loadTerms();
  };

  const deleteTerm = async (t: Term) => {
    if (!supabase) return;
    if (!window.confirm(`Delete term "${t.name}"?`)) return;
    const { error: err } = await supabase.from("terms").delete().eq("id", t.id);
    if (err) { setError(err.message); return; }
    loadTerms();
  };

  // ── Render ──
  if (!isAdmin) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          Only school admins can manage academic years and terms.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Headline + help */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h1 className="text-xl font-semibold text-gray-800">Academic Calendar</h1>
        <p className="text-xs text-gray-500 mt-1">
          Create an academic year (e.g. "2025-2026"), then add grading terms (Q1, Q2…)
          inside it. The Report Cards generator reads from these tables — and only
          becomes available for a term once you flip its lock 🔒 on.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Academic years */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Academic Years</h2>

        <form onSubmit={createYear} className="grid md:grid-cols-5 gap-3 items-end mb-4">
          <div>
            <label className="text-[11px] text-gray-500">Name</label>
            <input
              value={yearForm.name}
              onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
              placeholder="2025-2026"
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Start date</label>
            <input
              type="date"
              value={yearForm.start_date}
              onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">End date</label>
            <input
              type="date"
              value={yearForm.end_date}
              onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input
              type="checkbox"
              checked={yearForm.is_active}
              onChange={(e) => setYearForm({ ...yearForm, is_active: e.target.checked })}
            />
            Active
          </label>
          <button
            type="submit"
            disabled={savingYear}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {savingYear ? "…" : "+ Add Year"}
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
        ) : years.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No academic year yet — use the form above to add one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Period</th>
                  <th className="text-center py-2">Active</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr
                    key={y.id}
                    onClick={() => setSelectedYearId(y.id)}
                    className={`border-b cursor-pointer ${
                      y.id === selectedYearId ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="py-2.5 font-medium text-gray-800">
                      {y.name}
                      {y.id === selectedYearId && (
                        <span className="ml-2 text-[10px] text-blue-600">▸ editing terms</span>
                      )}
                    </td>
                    <td className="py-2.5 text-[12px] text-gray-500">
                      {y.start_date} → {y.end_date}
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleYearActive(y); }}
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          y.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-white text-gray-500 border-gray-200"
                        }`}
                      >
                        {y.is_active ? "Active ✓" : "Inactive"}
                      </button>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteYear(y); }}
                        className="text-[11px] bg-red-50 text-red-700 px-2.5 py-1 rounded hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Terms (only when a year is selected) */}
      {selectedYearId && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            Terms for {selectedYear?.name}
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Lock a term once all grades are in. Locking freezes grade edits
            (enforced at the database level) and is what enables the Report
            Cards generator for that term.
          </p>

          <form onSubmit={createTerm} className="grid md:grid-cols-6 gap-3 items-end mb-4">
            <div>
              <label className="text-[11px] text-gray-500">Name</label>
              <input
                value={termForm.name}
                onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
                placeholder="Q1 / Trimestre 1"
                className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Sequence</label>
              <input
                type="number"
                min={1}
                value={termForm.sequence}
                onChange={(e) => setTermForm({ ...termForm, sequence: Number(e.target.value) || 1 })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">Start date</label>
              <input
                type="date"
                value={termForm.start_date}
                onChange={(e) => setTermForm({ ...termForm, start_date: e.target.value })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">End date</label>
              <input
                type="date"
                value={termForm.end_date}
                onChange={(e) => setTermForm({ ...termForm, end_date: e.target.value })}
                className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input
                type="checkbox"
                checked={termForm.is_locked}
                onChange={(e) => setTermForm({ ...termForm, is_locked: e.target.checked })}
              />
              Locked
            </label>
            <button
              type="submit"
              disabled={savingTerm}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {savingTerm ? "…" : "+ Add Term"}
            </button>
          </form>

          {terms.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No terms in this year — add Q1 / Q2 / Q3 (or trimesters) above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                  <tr>
                    <th className="text-left py-2">#</th>
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Period</th>
                    <th className="text-center py-2">Status</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="py-2.5 text-gray-500">{t.sequence}</td>
                      <td className="py-2.5 font-medium text-gray-800">{t.name}</td>
                      <td className="py-2.5 text-[12px] text-gray-500">
                        {t.start_date} → {t.end_date}
                      </td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => toggleTermLock(t)}
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            t.is_locked
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-white text-gray-500 border-gray-200"
                          }`}
                        >
                          {t.is_locked ? "🔒 Locked" : "🔓 Open"}
                        </button>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => deleteTerm(t)}
                          className="text-[11px] bg-red-50 text-red-700 px-2.5 py-1 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TermsPage;
