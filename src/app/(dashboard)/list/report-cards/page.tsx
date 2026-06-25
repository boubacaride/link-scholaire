"use client";

// Report Cards admin / teacher page. Lets the user:
//   • Pick academic year → term → class.
//   • See every student with their computed overall, rank, mention and
//     last-generated status.
//   • Preview a single card inline (no upload).
//   • Generate a single card or the whole class.
//   • Re-run safely — generation is idempotent.
//
// Generation is blocked while the term is not locked, with an explicit
// banner pointing at the right control to lock it. This mirrors the
// real-world workflow: enter grades freely → lock → produce cards.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { computeClassReports, SCALE_FRENCH_20, SCALE_GPA_4 } from "@/lib/reportCard/calculations";
import type { ScaleConfig, StudentReportComputed } from "@/lib/reportCard/calculations";
import {
  generateAll, generateOne, buildPreviewProps,
  type GenerationResult,
} from "@/lib/reportCard/generator";
import type { SubjectInput } from "@/lib/reportCard/calculations";
import type { ReportCardDocumentProps } from "@/lib/reportCard/ReportCardDocument";

// react-pdf's PDFViewer can only run in the browser, never SSR.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <div className="p-10 text-center text-gray-400">Loading preview…</div> },
);
const ReportCardDocument = dynamic(
  () => import("@/lib/reportCard/ReportCardDocument"),
  { ssr: false },
);

interface AcademicYear { id: string; name: string; is_active: boolean }
interface Term         { id: string; name: string; sequence: number; is_locked: boolean }
interface ClassRow     { id: string; name: string; grade: number }
interface RosterStudent {
  id: string;
  first_name: string;
  last_name: string;
}

interface ClassRow_Computed {
  studentId: string;
  studentName: string;
  overall: number | null;
  rank: number | null;
  classSize: number;
  mention: string | null;
  status: "draft" | "published" | "none";
  generatedAt: string | null;
  pdfDocId: string | null;
}

const SCALES = { fr20: SCALE_FRENCH_20, af100: SCALE_GPA_4 } as const;

const ReportCardsPage = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const canManage = user?.role === "teacher" || user?.role === "school_admin" || user?.role === "platform_admin";

  const [years, setYears]     = useState<AcademicYear[]>([]);
  const [yearId, setYearId]   = useState<string>("");
  const [terms, setTerms]     = useState<Term[]>([]);
  const [termId, setTermId]   = useState<string>("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [scaleKey, setScaleKey] = useState<keyof typeof SCALES>("fr20");

  const [rows, setRows] = useState<ClassRow_Computed[]>([]);
  const [loading, setLoading] = useState(false);

  // Generation state
  const [busy, setBusy]               = useState(false);
  const [progress, setProgress]       = useState<{ done: number; total: number } | null>(null);
  const [batchResults, setBatchResults] = useState<GenerationResult[]>([]);

  // Preview modal state
  const [previewProps, setPreviewProps] = useState<ReportCardDocumentProps | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const scaleConfig: ScaleConfig = SCALES[scaleKey];

  // ── 1. Load academic years ─────────────────────────────────────
  useEffect(() => {
    if (!supabase || !user) return;
    (async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("id, name, is_active")
        .eq("school_id", user.schoolId)
        .order("start_date", { ascending: false });
      setYears(data ?? []);
      const active = (data ?? []).find((y) => y.is_active);
      setYearId(active?.id ?? data?.[0]?.id ?? "");
    })();
  }, [user?.schoolId]);

  // ── 2. Terms reacting to year ──────────────────────────────────
  useEffect(() => {
    if (!supabase || !yearId) { setTerms([]); setTermId(""); return; }
    (async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, name, sequence, is_locked")
        .eq("academic_year_id", yearId)
        .order("sequence", { ascending: true });
      setTerms(data ?? []);
      setTermId(data?.[0]?.id ?? "");
    })();
  }, [yearId]);

  // ── 3. Classes — admin sees all in school, teacher only her own ──
  useEffect(() => {
    if (!supabase || !user) return;
    (async () => {
      if (user.role === "teacher") {
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("class_id, classes:class_id(id, name, grade)")
          .eq("teacher_id", user.profileId);
        type Row = { class_id: string; classes: ClassRow | null };
        const rows = ((cs as unknown as Row[]) ?? [])
          .map((r) => r.classes).filter((c): c is ClassRow => c !== null);
        const uniq = Array.from(new Map(rows.map((c) => [c.id, c])).values());
        setClasses(uniq);
        setClassId(uniq[0]?.id ?? "");
      } else {
        const { data } = await supabase
          .from("classes")
          .select("id, name, grade")
          .eq("school_id", user.schoolId)
          .order("grade", { ascending: true });
        setClasses(data ?? []);
        setClassId(data?.[0]?.id ?? "");
      }
    })();
  }, [user?.profileId, user?.role]);

  const selectedTerm = useMemo(() => terms.find((t) => t.id === termId), [terms, termId]);
  const selectedYear = useMemo(() => years.find((y) => y.id === yearId), [years, yearId]);
  const selectedClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);

  // ── 4. Load roster + grades + existing report cards, then compute ──
  const loadRows = useCallback(async () => {
    if (!supabase || !user || !classId || !termId || !selectedTerm || !selectedYear) return;
    setLoading(true);

    // Roster
    const { data: roster } = await supabase
      .from("student_classes")
      .select("student_id, profiles:student_id(id, first_name, last_name)")
      .eq("class_id", classId);
    type RosterRow = { student_id: string; profiles: RosterStudent | null };
    const students = ((roster as unknown as RosterRow[]) ?? [])
      .map((r) => r.profiles).filter((p): p is RosterStudent => p !== null);

    if (students.length === 0) {
      setRows([]); setLoading(false); return;
    }

    // class_subjects (id + subject + coefficient)
    const { data: csData } = await supabase
      .from("class_subjects")
      .select("id, subject_id, coefficient, subject:subject_id(id, name)")
      .eq("class_id", classId);
    type CsRow = {
      id: string; subject_id: string; coefficient: number;
      subject: { id: string; name: string } | null;
    };
    const classSubjects = ((csData as unknown as CsRow[]) ?? [])
      .filter((cs): cs is CsRow & { subject: { id: string; name: string } } => cs.subject !== null);

    // Grades for the term
    const studentIds = students.map((s) => s.id);
    const subjectIds = classSubjects.map((cs) => cs.subject_id);
    let grades: { student_id: string; subject_id: string; score: number; max_score: number }[] = [];
    if (studentIds.length && subjectIds.length) {
      const { data } = await supabase
        .from("grades")
        .select("student_id, subject_id, score, max_score")
        .in("student_id", studentIds)
        .in("subject_id", subjectIds)
        .eq("term", selectedTerm.name)
        .eq("academic_year", selectedYear.name);
      grades = data ?? [];
    }

    // Existing report_cards for status badges
    const { data: existingCards } = await supabase
      .from("report_cards")
      .select("student_id, status, generated_at, pdf_document_id")
      .in("student_id", studentIds)
      .eq("term_id", termId);
    const existingByStudent = new Map(
      (existingCards ?? []).map((r) => [r.student_id, r] as const),
    );

    // Build inputs and compute
    const inputs = students.map((s) => ({
      studentId: s.id,
      subjects: classSubjects.map((cs): SubjectInput => ({
        subjectId: cs.id,
        subjectName: cs.subject.name,
        coefficient: cs.coefficient ?? 1,
        grades: grades
          .filter((g) => g.student_id === s.id && g.subject_id === cs.subject_id)
          .map((g) => ({ score: g.score, maxScore: g.max_score })),
        scaleMax: scaleConfig.max,
      })),
    }));
    const { reports } = computeClassReports(inputs, scaleConfig);

    const computed: ClassRow_Computed[] = students.map((s) => {
      const r = reports.find((x) => x.studentId === s.id) as StudentReportComputed & {
        rank: number | null; classSize: number;
      };
      const existing = existingByStudent.get(s.id);
      return {
        studentId: s.id,
        studentName: `${s.first_name} ${s.last_name}`.trim(),
        overall: r.overall,
        rank: r.rank,
        classSize: r.classSize,
        mention: r.mention?.label ?? null,
        status: (existing?.status as "draft" | "published" | undefined) ?? "none",
        generatedAt: existing?.generated_at ?? null,
        pdfDocId: existing?.pdf_document_id ?? null,
      };
    });

    // Sort by rank then name
    computed.sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.studentName.localeCompare(b.studentName);
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    });
    setRows(computed);
    setLoading(false);
  }, [classId, termId, selectedTerm?.name, selectedYear?.name, scaleKey]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ── Common generator opts ───────────────────────────────────────
  const baseOpts = (): {
    schoolId: string; classId: string; termId: string; termName: string;
    academicYearId: string; academicYearName: string; uploadedBy: string;
    scaleConfig: ScaleConfig; branding: { name: string };
  } | null => {
    if (!user || !classId || !termId || !selectedTerm || !selectedYear) return null;
    return {
      schoolId: user.schoolId,
      classId,
      termId,
      termName: selectedTerm.name,
      academicYearId: yearId,
      academicYearName: selectedYear.name,
      uploadedBy: user.profileId,
      scaleConfig,
      branding: { name: user.schoolName },
    };
  };

  const onPreview = async (studentId: string) => {
    if (!supabase) return;
    const opts = baseOpts(); if (!opts) return;
    setPreviewBusy(true);
    try {
      const props = await buildPreviewProps(supabase, { ...opts, studentId });
      setPreviewProps(props);
    } finally { setPreviewBusy(false); }
  };

  const onGenerateOne = async (studentId: string) => {
    if (!supabase || !selectedTerm?.is_locked) return;
    const opts = baseOpts(); if (!opts) return;
    setBusy(true);
    const result = await generateOne(supabase, { ...opts, studentId });
    setBatchResults([result]);
    setBusy(false);
    loadRows();
  };

  const onGenerateAll = async () => {
    if (!supabase || !selectedTerm?.is_locked) return;
    const opts = baseOpts(); if (!opts) return;
    setBusy(true);
    setBatchResults([]);
    setProgress({ done: 0, total: rows.length });
    const out = await generateAll(supabase, opts, (done, total, last) => {
      setProgress({ done, total });
      setBatchResults((p) => [...p, last]);
    });
    setBatchResults(out);
    setBusy(false);
    setProgress(null);
    loadRows();
  };

  const downloadGenerated = async (pdfDocId: string | null) => {
    if (!pdfDocId || !supabase) return;
    const { data: doc } = await supabase
      .from("student_documents")
      .select("storage_path, file_name")
      .eq("id", pdfDocId)
      .single();
    if (!doc) return;
    const { data: signed } = await supabase.storage
      .from("student-documents")
      .createSignedUrl(doc.storage_path, 60 * 60);
    if (!signed?.signedUrl) return;
    const a = document.createElement("a");
    a.href = signed.signedUrl;
    a.download = doc.file_name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (!canManage) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          Only teachers and admins can manage report cards.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Pickers */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-gray-500">Academic year</label>
            <select
              value={yearId} onChange={(e) => setYearId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}{y.is_active ? " ✓" : ""}</option>
              ))}
              {years.length === 0 && <option value="">— No years configured —</option>}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Term</label>
            <select
              value={termId} onChange={(e) => setTermId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_locked ? " 🔒" : ""}</option>
              ))}
              {terms.length === 0 && <option value="">— No terms configured —</option>}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Class</label>
            <select
              value={classId} onChange={(e) => setClassId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (G{c.grade})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Grading scale</label>
            <select
              value={scaleKey} onChange={(e) => setScaleKey(e.target.value as keyof typeof SCALES)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="fr20">/20 (Très Bien, Bien, …)</option>
              <option value="af100">/100 A-F GPA</option>
            </select>
          </div>
        </div>

        {/* Lock-status banner */}
        {selectedTerm && !selectedTerm.is_locked && (
          <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
            <span className="font-semibold">Term is open.</span>{" "}
            Lock the term in your term settings before generating report cards. While the
            term is open, teachers can still edit grades and the generator is disabled.
          </div>
        )}

        {/* Action bar */}
        <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
          <div className="text-xs text-gray-500">
            {loading
              ? "Loading…"
              : `${rows.length} student${rows.length === 1 ? "" : "s"} · ${selectedClass?.name ?? "—"}`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onGenerateAll}
              disabled={busy || !selectedTerm?.is_locked || rows.length === 0}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Generating…" : "Generate All"}
            </button>
          </div>
        </div>

        {/* Progress */}
        {progress && (
          <div className="mt-2">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{progress.done} / {progress.total}</p>
          </div>
        )}

        {/* Batch results */}
        {batchResults.length > 0 && (
          <div className="mt-3 text-[11px] grid md:grid-cols-2 gap-1">
            {batchResults.map((r) => (
              <div
                key={r.studentId}
                className={`px-3 py-1.5 rounded-md border ${
                  r.ok ? "bg-green-50 border-green-200 text-green-800"
                       : "bg-red-50 border-red-200 text-red-700"}`}
              >
                {r.ok ? "✓" : "✗"} {r.studentName}{r.error ? ` — ${r.error}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roster + computed metrics */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        {rows.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">No students in this class.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="text-left py-2">Student</th>
                  <th className="text-center py-2">Overall</th>
                  <th className="text-center py-2">Rank</th>
                  <th className="text-center py-2">Mention</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-b hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">{r.studentName}</td>
                    <td className="py-2.5 text-center font-mono">
                      {r.overall === null ? "—" : r.overall.toFixed(2)}
                    </td>
                    <td className="py-2.5 text-center text-gray-600">
                      {r.rank ? `${r.rank} / ${r.classSize}` : "—"}
                    </td>
                    <td className="py-2.5 text-center">{r.mention ?? "—"}</td>
                    <td className="py-2.5 text-center">
                      {r.status === "published" ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          Published
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          Not generated
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => onPreview(r.studentId)}
                          disabled={previewBusy}
                          className="text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded hover:bg-blue-100 disabled:opacity-50"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => onGenerateOne(r.studentId)}
                          disabled={busy || !selectedTerm?.is_locked}
                          className="text-[11px] bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-40"
                        >
                          Generate
                        </button>
                        {r.pdfDocId && (
                          <button
                            onClick={() => downloadGenerated(r.pdfDocId)}
                            className="text-[11px] bg-gray-100 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-200"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewProps && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">
                Preview · {previewProps.student.fullName}
              </p>
              <button
                onClick={() => setPreviewProps(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >×</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <PDFViewer width="100%" height="100%" showToolbar>
                <ReportCardDocument {...previewProps} />
              </PDFViewer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCardsPage;
