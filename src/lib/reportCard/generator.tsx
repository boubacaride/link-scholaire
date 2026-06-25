// Report-card generation pipeline. Runs in the browser using the
// authenticated Supabase client, so RLS does the authorization — no
// service-role key on the client. The flow is:
//
//   1. Pull every student + lesson + grade + attendance + remark for
//      the (class, term) combo in batched queries.
//   2. Run the pure calculation library to derive subject results,
//      overall, mention, decision, ranks and per-subject class stats.
//   3. Render the @react-pdf/renderer template to a Blob per student.
//   4. Upload the Blob to the private `student-documents` bucket at
//        <school_id>/<student_id>/report-cards/<year>-<term>.pdf
//      using upsert: true so re-runs replace cleanly.
//   5. Upsert a `student_documents` row (category='report_card') and a
//      `report_cards` row, both keyed by (student, term).
//
// Idempotency: every write is keyed on (student, term). Re-running the
// generator on the same class produces the same PDF path, replaces the
// storage object, and updates the existing metadata rows in place.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import ReportCardDocument, {
  type AttendanceSummary, type SchoolBranding, type ReportCardDocumentProps,
} from "./ReportCardDocument";
import {
  computeClassReports, SCALE_FRENCH_20,
  type ScaleConfig, type SubjectInput,
} from "./calculations";

// ─── Inputs ───────────────────────────────────────────────────────

export interface GenerateOptions {
  schoolId: string;
  classId: string;
  /** Term row id (from the `terms` table). */
  termId: string;
  /** Term name as stored on `grades.term` (text field on legacy rows). */
  termName: string;
  /** Academic year row id. */
  academicYearId: string;
  /** Academic year name as stored on `grades.academic_year`. */
  academicYearName: string;
  /** Profile id of the teacher / admin issuing the cards. */
  uploadedBy: string;
  /** Optional principal remark applied to every student in the batch. */
  principalRemark?: string;
  scaleConfig?: ScaleConfig;
  locale?: "en" | "fr";
  branding: SchoolBranding;
}

export interface GenerateOneOptions extends GenerateOptions {
  studentId: string;
}

export interface GenerationResult {
  studentId: string;
  studentName: string;
  ok: boolean;
  /** Public-ish key inside the bucket — useful for debug. Not a public URL. */
  storagePath?: string;
  error?: string;
}

// ─── Data fetching ────────────────────────────────────────────────

interface RawClassData {
  students: { id: string; member_id: string | null; first_name: string; last_name: string;
              date_of_birth: string | null; avatar_url: string | null }[];
  classSubjects: { id: string; subject_id: string; teacher_id: string;
                   coefficient: number; subject: { id: string; name: string } }[];
  components: { id: string; class_subject_id: string; name: string; weight: number }[];
  grades: { student_id: string; subject_id: string; score: number; max_score: number;
            exam_type: string }[];
  remarks: { student_id: string; class_subject_id: string; remark: string }[];
  attendance: { student_id: string; status: string }[];
  className: string;
}

async function fetchClassData(
  supabase: SupabaseClient,
  opts: GenerateOptions,
): Promise<RawClassData> {
  const { classId, termName, academicYearName } = opts;

  // The class roster.
  const { data: rosterRows, error: rosterErr } = await supabase
    .from("student_classes")
    .select("student_id, profiles:student_id(id, member_id, first_name, last_name, date_of_birth, avatar_url)")
    .eq("class_id", classId);
  if (rosterErr) throw rosterErr;
  type RosterRow = { student_id: string; profiles: RawClassData["students"][number] | null };
  const roster = (rosterRows as unknown as RosterRow[]) ?? [];
  const students = roster.map((r) => r.profiles).filter((p): p is RawClassData["students"][number] => p !== null);
  const studentIds = students.map((s) => s.id);

  // class_subjects with their subject + coefficient, plus components.
  const { data: csRows, error: csErr } = await supabase
    .from("class_subjects")
    .select("id, subject_id, teacher_id, coefficient, subject:subject_id(id, name)")
    .eq("class_id", classId);
  if (csErr) throw csErr;
  type CsRow = {
    id: string; subject_id: string; teacher_id: string; coefficient: number;
    subject: { id: string; name: string } | null;
  };
  const classSubjects = ((csRows as unknown as CsRow[]) ?? [])
    .filter((cs): cs is CsRow & { subject: { id: string; name: string } } => cs.subject !== null);
  const classSubjectIds = classSubjects.map((cs) => cs.id);
  const subjectIds = classSubjects.map((cs) => cs.subject_id);

  // Class metadata (just the name for the PDF).
  const { data: cls } = await supabase
    .from("classes").select("name").eq("id", classId).single();

  // Grade components for those class_subjects.
  let components: RawClassData["components"] = [];
  if (classSubjectIds.length) {
    const { data } = await supabase
      .from("grade_components")
      .select("id, class_subject_id, name, weight")
      .in("class_subject_id", classSubjectIds);
    components = data ?? [];
  }

  // Grades for the whole class, this term, this year.
  let grades: RawClassData["grades"] = [];
  if (studentIds.length && subjectIds.length) {
    const { data } = await supabase
      .from("grades")
      .select("student_id, subject_id, score, max_score, exam_type")
      .in("student_id", studentIds)
      .in("subject_id", subjectIds)
      .eq("term", termName)
      .eq("academic_year", academicYearName);
    grades = data ?? [];
  }

  // Subject remarks for the term.
  let remarks: RawClassData["remarks"] = [];
  if (studentIds.length && classSubjectIds.length) {
    const { data } = await supabase
      .from("subject_remarks")
      .select("student_id, class_subject_id, remark")
      .in("student_id", studentIds)
      .in("class_subject_id", classSubjectIds)
      .eq("term_id", opts.termId);
    remarks = data ?? [];
  }

  // Attendance for the term window. We hold the term's start/end on the
  // `terms` row; pull them inline so we don't need an extra arg.
  let attendance: RawClassData["attendance"] = [];
  if (studentIds.length) {
    const { data: term } = await supabase
      .from("terms").select("start_date, end_date").eq("id", opts.termId).single();
    if (term?.start_date && term?.end_date) {
      const { data } = await supabase
        .from("attendance")
        .select("student_id, status")
        .in("student_id", studentIds)
        .gte("date", term.start_date)
        .lte("date", term.end_date);
      attendance = data ?? [];
    }
  }

  return { students, classSubjects, components, grades, remarks, attendance, className: cls?.name ?? "" };
}

// ─── Computation per student ──────────────────────────────────────

function buildSubjectsForStudent(
  studentId: string,
  data: RawClassData,
  scaleMax: number,
): SubjectInput[] {
  // Map components by class_subject_id for fast lookup.
  const compsByCs = new Map<string, { id: string; weight: number }[]>();
  for (const c of data.components) {
    const arr = compsByCs.get(c.class_subject_id) ?? [];
    arr.push({ id: c.id, weight: c.weight });
    compsByCs.set(c.class_subject_id, arr);
  }
  return data.classSubjects.map((cs) => {
    const subjectGrades = data.grades
      .filter((g) => g.student_id === studentId && g.subject_id === cs.subject_id)
      .map((g) => ({ score: g.score, maxScore: g.max_score }));
    return {
      subjectId: cs.id,                       // use class_subject_id as the stable key
      subjectName: cs.subject.name,
      coefficient: cs.coefficient ?? 1,
      components: compsByCs.get(cs.id),
      grades: subjectGrades,
      scaleMax,
    };
  });
}

function attendanceSummaryFor(studentId: string, data: RawClassData): AttendanceSummary {
  const rows = data.attendance.filter((a) => a.student_id === studentId);
  const summary: AttendanceSummary = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of rows) {
    if (r.status === "present" || r.status === "absent" ||
        r.status === "late" || r.status === "excused") {
      summary[r.status] += 1;
    }
  }
  return summary;
}

function remarksFor(
  studentId: string,
  data: RawClassData,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of data.remarks) {
    if (r.student_id === studentId) out[r.class_subject_id] = r.remark;
  }
  return out;
}

// ─── PDF render + upload + DB upsert (per student) ────────────────

async function uploadCardForStudent(
  supabase: SupabaseClient,
  opts: GenerateOptions,
  studentId: string,
  studentName: string,
  props: ReportCardDocumentProps,
): Promise<string> {
  // 1. Render to Blob via react-pdf's `pdf()` helper.
  const blob: Blob = await pdf(<ReportCardDocument {...props} />).toBlob();

  // 2. Stable path so re-runs replace cleanly.
  const safeYear = opts.academicYearName.replace(/[^a-zA-Z0-9-]/g, "_");
  const safeTerm = opts.termName.replace(/[^a-zA-Z0-9-]/g, "_");
  const fileName = `${safeYear}-${safeTerm}.pdf`;
  const storagePath = `${opts.schoolId}/${studentId}/report-cards/${fileName}`;

  // 3. Upload (upsert).
  const { error: upErr } = await supabase.storage
    .from("student-documents")
    .upload(storagePath, blob, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "0",
    });
  if (upErr) throw upErr;

  // 4. Upsert the student_documents metadata row keyed on the path so a
  //    second run reuses the same id (and any FK pointers stay live).
  const docTitle = `${props.termName} ${props.academicYear} — ${studentName}`;
  // No unique index on storage_path exists; emulate idempotency by
  // looking up the existing row and updating it, otherwise insert.
  const { data: existingDoc } = await supabase
    .from("student_documents")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();

  let documentId: string;
  if (existingDoc?.id) {
    const { error: updErr } = await supabase
      .from("student_documents")
      .update({
        title: docTitle,
        category: "report_card",
        file_name: fileName,
        file_size: blob.size,
        term: opts.termName,
        academic_year: opts.academicYearName,
        uploaded_by: opts.uploadedBy,
      })
      .eq("id", existingDoc.id);
    if (updErr) throw updErr;
    documentId = existingDoc.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("student_documents")
      .insert({
        school_id: opts.schoolId,
        student_id: studentId,
        uploaded_by: opts.uploadedBy,
        category: "report_card",
        title: docTitle,
        storage_path: storagePath,
        file_name: fileName,
        file_size: blob.size,
        term: opts.termName,
        academic_year: opts.academicYearName,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    documentId = inserted.id;
  }

  // 5. Upsert the report_cards row (unique on student_id + term_id).
  const { error: rcErr } = await supabase
    .from("report_cards")
    .upsert({
      student_id: studentId,
      class_id: opts.classId,
      term_id: opts.termId,
      academic_year_id: opts.academicYearId,
      overall_average: props.computed.overall,
      rank: props.computed.rank ?? null,
      class_size: props.computed.classSize ?? null,
      mention: props.computed.mention?.label ?? null,
      decision: props.computed.decision,
      principal_remark: props.principalRemark ?? null,
      status: "published",
      pdf_document_id: documentId,
      generated_by: opts.uploadedBy,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "student_id,term_id" });
  if (rcErr) throw rcErr;

  return storagePath;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Generate a single student's report card. Throws on any failure so the
 * caller can show a precise error in the preview / single-generate UI.
 */
export async function generateOne(
  supabase: SupabaseClient,
  opts: GenerateOneOptions,
): Promise<GenerationResult> {
  const data = await fetchClassData(supabase, opts);
  const student = data.students.find((s) => s.id === opts.studentId);
  if (!student) {
    return { studentId: opts.studentId, studentName: "", ok: false, error: "Student not in class." };
  }

  const scaleConfig = opts.scaleConfig ?? SCALE_FRENCH_20;

  // To compute rank we still need the whole class.
  const allInputs = data.students.map((s) => ({
    studentId: s.id,
    subjects: buildSubjectsForStudent(s.id, data, scaleConfig.max),
  }));
  const { reports, subjectStats } = computeClassReports(allInputs, scaleConfig);
  const mine = reports.find((r) => r.studentId === opts.studentId)!;

  const studentName = `${student.first_name} ${student.last_name}`.trim();

  const props: ReportCardDocumentProps = {
    branding: opts.branding,
    student: {
      fullName: studentName,
      studentNumber: student.member_id ?? undefined,
      className: data.className,
      dateOfBirth: student.date_of_birth ?? undefined,
      photoDataUrl: undefined,
    },
    academicYear: opts.academicYearName,
    termName: opts.termName,
    computed: mine,
    subjectStats,
    remarks: remarksFor(opts.studentId, data),
    attendance: attendanceSummaryFor(opts.studentId, data),
    principalRemark: opts.principalRemark,
    locale: opts.locale ?? "fr",
  };

  try {
    const storagePath = await uploadCardForStudent(supabase, opts, opts.studentId, studentName, props);
    return { studentId: opts.studentId, studentName, ok: true, storagePath };
  } catch (e: unknown) {
    return {
      studentId: opts.studentId, studentName, ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Generate the whole class. Streams a progress callback after every
 * student so the UI can show a live bar + partial results.
 */
export async function generateAll(
  supabase: SupabaseClient,
  opts: GenerateOptions,
  onProgress?: (done: number, total: number, last: GenerationResult) => void,
): Promise<GenerationResult[]> {
  const data = await fetchClassData(supabase, opts);
  const scaleConfig = opts.scaleConfig ?? SCALE_FRENCH_20;

  const allInputs = data.students.map((s) => ({
    studentId: s.id,
    subjects: buildSubjectsForStudent(s.id, data, scaleConfig.max),
  }));
  const { reports, subjectStats } = computeClassReports(allInputs, scaleConfig);

  const results: GenerationResult[] = [];
  for (let i = 0; i < data.students.length; i++) {
    const student = data.students[i];
    const studentName = `${student.first_name} ${student.last_name}`.trim();
    const computed = reports.find((r) => r.studentId === student.id)!;

    const props: ReportCardDocumentProps = {
      branding: opts.branding,
      student: {
        fullName: studentName,
        studentNumber: student.member_id ?? undefined,
        className: data.className,
        dateOfBirth: student.date_of_birth ?? undefined,
      },
      academicYear: opts.academicYearName,
      termName: opts.termName,
      computed,
      subjectStats,
      remarks: remarksFor(student.id, data),
      attendance: attendanceSummaryFor(student.id, data),
      principalRemark: opts.principalRemark,
      locale: opts.locale ?? "fr",
    };

    let result: GenerationResult;
    try {
      const storagePath = await uploadCardForStudent(supabase, opts, student.id, studentName, props);
      result = { studentId: student.id, studentName, ok: true, storagePath };
    } catch (e: unknown) {
      result = {
        studentId: student.id, studentName, ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    results.push(result);
    onProgress?.(i + 1, data.students.length, result);
  }
  return results;
}

/**
 * Build the props needed by the inline PDF preview (no upload, no DB
 * writes). The UI passes the same arguments as generateOne but only
 * gets back the props ready to feed into <PDFViewer>.
 */
export async function buildPreviewProps(
  supabase: SupabaseClient,
  opts: GenerateOneOptions,
): Promise<ReportCardDocumentProps | null> {
  const data = await fetchClassData(supabase, opts);
  const student = data.students.find((s) => s.id === opts.studentId);
  if (!student) return null;

  const scaleConfig = opts.scaleConfig ?? SCALE_FRENCH_20;
  const allInputs = data.students.map((s) => ({
    studentId: s.id,
    subjects: buildSubjectsForStudent(s.id, data, scaleConfig.max),
  }));
  const { reports, subjectStats } = computeClassReports(allInputs, scaleConfig);
  const mine = reports.find((r) => r.studentId === opts.studentId)!;

  return {
    branding: opts.branding,
    student: {
      fullName: `${student.first_name} ${student.last_name}`.trim(),
      studentNumber: student.member_id ?? undefined,
      className: data.className,
      dateOfBirth: student.date_of_birth ?? undefined,
    },
    academicYear: opts.academicYearName,
    termName: opts.termName,
    computed: mine,
    subjectStats,
    remarks: remarksFor(opts.studentId, data),
    attendance: attendanceSummaryFor(opts.studentId, data),
    principalRemark: opts.principalRemark,
    locale: opts.locale ?? "fr",
  };
}
