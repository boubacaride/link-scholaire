"use client";

// Report Cards — classic "High School Report Card" generator.
//
// Workflow (one student at a time):
//   1. Pick academic year → class → student.
//   2. Click "Generate report". We pull the student's grades for the year,
//      bucket them into the year's first two terms (1st / 2nd Semester),
//      average each subject per semester, and compute the Final as the
//      average of the two semesters. Attendance, school details and the
//      signatory names are loaded too.
//   3. The teacher edits the Comments box and clicks Save (persisted per
//      student + year). "Print / Save as PDF" prints just the card.
//
// Grades → letters use src/lib/reportCard/usGrades.ts. The card visual lives
// in src/components/reportCard/USReportCard.tsx.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import USReportCard, { type ReportCardRow } from "@/components/reportCard/USReportCard";
import {
  computeSubjectRow,
  countAttendance,
  gradeLevelLabel,
  overallAveragePercent,
} from "@/lib/reportCard/usGrades";

interface AcademicYear { id: string; name: string; is_active: boolean; start_date: string; end_date: string }
interface Term { id: string; name: string; sequence: number }
interface ClassRow { id: string; name: string; grade: number }
interface Student {
  id: string;
  first_name: string;
  last_name: string;
  institutional_id: string | null;
  member_id: string | null;
}

interface GeneratedCard {
  studentId: string;
  school: { name: string; address: string | null; phone: string | null; email: string | null; logoUrl: string | null };
  student: { name: string; studentId: string; grade: string; schoolYear: string };
  rows: ReportCardRow[];
  overallPercent: number | null;
  attendance: { present: number; absent: number; tardies: number };
  signatures: { parent?: string; teacher?: string; principal?: string };
}

const fullName = (p: { first_name: string; last_name: string }) =>
  `${p.first_name} ${p.last_name}`.trim();

const ReportCardsPage = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const canManage =
    user?.role === "teacher" || user?.role === "school_admin" || user?.role === "platform_admin";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");

  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [comment, setComment] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selectedYear = useMemo(() => years.find((y) => y.id === yearId), [years, yearId]);

  // ── Load academic years ───────────────────────────────────────────
  useEffect(() => {
    if (!supabase || !user) return;
    (async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("id, name, is_active, start_date, end_date")
        .eq("school_id", user.schoolId)
        .order("start_date", { ascending: false });
      setYears(data ?? []);
      const active = (data ?? []).find((y) => y.is_active);
      setYearId(active?.id ?? data?.[0]?.id ?? "");
    })();
  }, [user?.schoolId]);

  // ── Terms for the selected year (ordered) ─────────────────────────
  useEffect(() => {
    if (!supabase || !yearId) { setTerms([]); return; }
    (async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, name, sequence")
        .eq("academic_year_id", yearId)
        .order("sequence", { ascending: true });
      setTerms(data ?? []);
    })();
  }, [yearId]);

  // ── Classes — admin sees all, teacher only her own ────────────────
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
          .map((r) => r.classes)
          .filter((c): c is ClassRow => c !== null);
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

  // ── Students for the selected class ───────────────────────────────
  useEffect(() => {
    if (!supabase || !classId) { setStudents([]); setStudentId(""); return; }
    (async () => {
      const { data } = await supabase
        .from("student_classes")
        .select("student_id, profiles:student_id(id, first_name, last_name, institutional_id, member_id)")
        .eq("class_id", classId);
      type RosterRow = { student_id: string; profiles: Student | null };
      const list = ((data as unknown as RosterRow[]) ?? [])
        .map((r) => r.profiles)
        .filter((p): p is Student => p !== null)
        .sort((a, b) => fullName(a).localeCompare(fullName(b)));
      setStudents(list);
      setStudentId(list[0]?.id ?? "");
    })();
  }, [classId]);

  // Reset any shown card when the selection changes.
  useEffect(() => { setCard(null); setMsg(null); }, [studentId, classId, yearId]);

  // ── Generate the card for the selected student ────────────────────
  const onGenerate = useCallback(async () => {
    if (!supabase || !user || !studentId || !classId || !selectedYear) return;
    setGenerating(true);
    setMsg(null);
    try {
      const student = students.find((s) => s.id === studentId);
      if (!student) { setMsg("Pick a student first."); return; }

      // Pull the student's actual grades (subject name joined), the same way
      // the student dashboard does — by student_id, with no brittle filters.
      // The grade form stores academic_year as a bare calendar year ("2026")
      // and term as free text ("Term 1"), which rarely match the configured
      // academic-year / term *names*; building from the real rows is what
      // keeps the card from coming up empty.
      type GradeRow = {
        subject_id: string;
        score: number;
        max_score: number;
        term: string | null;
        academic_year: string | null;
        subject: { id: string; name: string } | null;
      };
      const { data: gradeData } = await supabase
        .from("grades")
        .select("subject_id, score, max_score, term, academic_year, subject:subject_id(id, name)")
        .eq("student_id", studentId);
      const allGrades = ((gradeData as unknown as GradeRow[]) ?? []).filter((g) => g.subject);

      // Soft-scope to the selected year: only narrow if some grades actually
      // carry that year name; otherwise fall back to every grade so a
      // year-name mismatch never blanks the card.
      const inYear = allGrades.filter((g) => g.academic_year === selectedYear.name);
      const used = inYear.length ? inYear : allGrades;

      // Subjects come from the class's curriculum *unioned* with any subject
      // the student actually has a grade in (covers grades whose subject was
      // never linked to the class via class_subjects).
      const { data: csData } = await supabase
        .from("class_subjects")
        .select("subject_id, subject:subject_id(id, name)")
        .eq("class_id", classId);
      type CsRow = { subject_id: string; subject: { id: string; name: string } | null };
      const subjMap = new Map<string, string>();
      ((csData as unknown as CsRow[]) ?? []).forEach((cs) => {
        if (cs.subject) subjMap.set(cs.subject_id, cs.subject.name);
      });
      used.forEach((g) => {
        if (g.subject && !subjMap.has(g.subject_id)) subjMap.set(g.subject_id, g.subject.name);
      });
      const subjects = Array.from(subjMap, ([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Determine the two "semester" columns. Use the configured term order
      // where it overlaps the terms present on the grades, then append any
      // other terms found (sorted). With only "Term 1" recorded, the 2nd
      // column simply shows "—" and Final equals the 1st.
      const presentTerms = Array.from(
        new Set(used.map((g) => g.term).filter((t): t is string => !!t)),
      );
      const configuredOrder = terms.map((t) => t.name);
      const orderedTerms = [
        ...configuredOrder.filter((n) => presentTerms.includes(n)),
        ...presentTerms.filter((n) => !configuredOrder.includes(n)).sort(),
      ];
      const sem1Name: string | null = orderedTerms[0] ?? null;
      const sem2Name: string | null = orderedTerms[1] ?? null;

      const rows: ReportCardRow[] = subjects.map((s) =>
        computeSubjectRow(
          s.name,
          used
            .filter((g) => g.subject_id === s.id)
            .map((g) => ({ score: g.score, maxScore: g.max_score, term: g.term })),
          sem1Name,
          sem2Name,
        ),
      );

      // Overall average — unweighted mean of every grade-row %, identical to
      // the student dashboard's Average so the two reconcile.
      const overallPercent = overallAveragePercent(
        used.map((g) => ({ score: g.score, maxScore: g.max_score })),
      );

      // Attendance across the academic year.
      const { data: att } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", studentId)
        .gte("date", selectedYear.start_date)
        .lte("date", selectedYear.end_date);
      const attendance = countAttendance((att as { status: string }[]) ?? []);

      // School details for the footer + badge.
      const { data: sch } = await supabase
        .from("schools")
        .select("name, address, city, state, country, phone, email, logo_url")
        .eq("id", user.schoolId)
        .single();
      const addressParts = [sch?.address, sch?.city, sch?.state, sch?.country].filter(Boolean);
      const school = {
        name: sch?.name ?? user.schoolName,
        address: addressParts.length ? addressParts.join(", ") : null,
        phone: sch?.phone ?? null,
        email: sch?.email ?? null,
        logoUrl: sch?.logo_url ?? null,
      };

      // Signatory names (best-effort — RLS may hide some; lines still print).
      const signatures: { parent?: string; teacher?: string; principal?: string } = {};
      try {
        const { data: cls } = await supabase
          .from("classes")
          .select("supervisor_id")
          .eq("id", classId)
          .single();
        if (cls?.supervisor_id) {
          const { data: sup } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", cls.supervisor_id)
            .maybeSingle();
          if (sup) signatures.teacher = fullName(sup);
        }
      } catch { /* ignore */ }
      if (!signatures.teacher && user.role === "teacher") {
        signatures.teacher = `${user.firstName} ${user.lastName}`.trim();
      }
      try {
        const { data: admin } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("school_id", user.schoolId)
          .eq("role", "school_admin")
          .limit(1)
          .maybeSingle();
        if (admin) signatures.principal = fullName(admin);
      } catch { /* ignore */ }

      // Existing saved comment (table may not be migrated yet — tolerate).
      let savedComment = "";
      try {
        const { data: cmt } = await supabase
          .from("report_card_comments")
          .select("comment")
          .eq("student_id", studentId)
          .eq("academic_year_id", yearId)
          .maybeSingle();
        savedComment = cmt?.comment ?? "";
      } catch { /* table missing → empty */ }
      setComment(savedComment);

      setCard({
        studentId,
        school,
        student: {
          name: fullName(student),
          studentId: student.institutional_id ?? student.member_id ?? "—",
          grade: gradeLevelLabel(classes.find((c) => c.id === classId)?.grade),
          schoolYear: selectedYear.name,
        },
        rows,
        overallPercent,
        attendance,
        signatures,
      });
    } finally {
      setGenerating(false);
    }
  }, [supabase, user, studentId, classId, selectedYear, students, terms, classes, yearId]);

  // ── Save the edited comment ───────────────────────────────────────
  const onSaveComment = async () => {
    if (!supabase || !user || !card || !yearId) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from("report_card_comments").upsert(
      {
        school_id: user.schoolId,
        student_id: card.studentId,
        academic_year_id: yearId,
        comment,
        updated_by: user.profileId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,academic_year_id" },
    );
    setSaving(false);
    setMsg(error ? `Error saving comment: ${error.message}` : "Comment saved.");
  };

  if (!canManage) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-sm text-gray-500 text-center">
          Only teachers and admins can generate report cards.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Controls — hidden when printing */}
      <div className="no-print bg-white rounded-xl border shadow-sm p-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-gray-500">Academic year</label>
            <select
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}{y.is_active ? " ✓" : ""}</option>
              ))}
              {years.length === 0 && <option value="">— No years configured —</option>}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (G{c.grade})</option>
              ))}
              {classes.length === 0 && <option value="">— No classes —</option>}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">Student</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{fullName(s)}</option>
              ))}
              {students.length === 0 && <option value="">— No students —</option>}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={onGenerate}
            disabled={generating || !studentId || !selectedYear}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? "Generating…" : "Generate report"}
          </button>
          {card && (
            <>
              <button
                onClick={onSaveComment}
                disabled={saving}
                className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save comment"}
              </button>
              <button
                onClick={() => window.print()}
                className="text-sm bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-900"
              >
                Print / Save as PDF
              </button>
            </>
          )}
          {msg && (
            <span className={`text-xs ${msg.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>
              {msg}
            </span>
          )}
        </div>
        {terms.length < 2 && years.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Tip: configure two terms for this academic year (Terms page) to split grades into 1st and 2nd
            Semester. Without them, grades fall back to the semester labels found on the grades themselves.
          </p>
        )}
      </div>

      {/* The card */}
      {card && (
        <USReportCard
          school={card.school}
          student={card.student}
          sem1Label="1st Semester"
          sem2Label="2nd Semester"
          rows={card.rows}
          overallPercent={card.overallPercent}
          attendance={card.attendance}
          comment={comment}
          onCommentChange={setComment}
          editable
          signatures={card.signatures}
        />
      )}
    </div>
  );
};

export default ReportCardsPage;
