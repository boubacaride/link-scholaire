// End-to-end-ish check of the report-card data path *minus the database*:
// we hand the transforms the same row shapes the page reads from Supabase
// (grades with subject_id/score/max_score/term, attendance with status) and
// assert the card rows + attendance the student would see.

import { describe, it, expect } from "vitest";
import { computeSubjectRow, countAttendance, type SubjectMark } from "./usGrades";

// Mirror the page: per subject, filter the student's grades and map to marks.
type GradeRow = { subject_id: string; score: number; max_score: number; term: string | null };
const marksFor = (grades: GradeRow[], subjectId: string): SubjectMark[] =>
  grades
    .filter((g) => g.subject_id === subjectId)
    .map((g) => ({ score: g.score, maxScore: g.max_score, term: g.term }));

describe("report-card pipeline (terms configured)", () => {
  const SEM1 = "Semester 1";
  const SEM2 = "Semester 2";
  const subjects = [
    { id: "math", name: "Mathematics" },
    { id: "eng", name: "English" },
    { id: "sci", name: "Science" },
    { id: "hist", name: "History" },
  ];

  // A realistic spread of a single student's grades across two semesters.
  const grades: GradeRow[] = [
    // Mathematics — S1 avg (80,90)=85→B ; S2 88→B+ ; final (85+88)/2=86.5→87→B+
    { subject_id: "math", score: 80, max_score: 100, term: SEM1 },
    { subject_id: "math", score: 18, max_score: 20, term: SEM1 }, // 90%
    { subject_id: "math", score: 88, max_score: 100, term: SEM2 },
    // English — S1 95→A ; S2 100→A+ ; final 97.5→98→A+
    { subject_id: "eng", score: 95, max_score: 100, term: SEM1 },
    { subject_id: "eng", score: 100, max_score: 100, term: SEM2 },
    // Science — only S1 72→C- ; S2 none → final = S1 = C-
    { subject_id: "sci", score: 72, max_score: 100, term: SEM1 },
    // History — no grades at all → all dashes
  ];

  const rows = subjects.map((s) =>
    computeSubjectRow(s.name, marksFor(grades, s.id), SEM1, SEM2),
  );
  const byName = Object.fromEntries(rows.map((r) => [r.subject, r]));

  it("averages each semester and finals correctly", () => {
    expect(byName["Mathematics"]).toEqual({ subject: "Mathematics", sem1: "B", sem2: "B+", final: "B+" });
    expect(byName["English"]).toEqual({ subject: "English", sem1: "A", sem2: "A+", final: "A+" });
  });

  it("falls back to the single available semester for the final", () => {
    expect(byName["Science"]).toEqual({ subject: "Science", sem1: "C-", sem2: "—", final: "C-" });
  });

  it("shows dashes for a subject with no recorded grades", () => {
    expect(byName["History"]).toEqual({ subject: "History", sem1: "—", sem2: "—", final: "—" });
  });
});

describe("report-card pipeline (no terms configured → fallback)", () => {
  // sem1/sem2 names unknown: every mark folds into Final, semester cells dash.
  it("folds all marks into the Final", () => {
    const marks: SubjectMark[] = [
      { score: 70, maxScore: 100, term: null },
      { score: 80, maxScore: 100, term: null }, // avg 75 → C
    ];
    expect(computeSubjectRow("Physical Education", marks, null, null)).toEqual({
      subject: "Physical Education",
      sem1: "—",
      sem2: "—",
      final: "C",
    });
  });
});

describe("attendance tally", () => {
  it("counts present/absent, maps late→tardies, ignores excused", () => {
    const att = [
      { status: "present" }, { status: "present" }, { status: "present" },
      { status: "absent" },
      { status: "late" }, { status: "late" },
      { status: "excused" },
    ];
    expect(countAttendance(att)).toEqual({ present: 3, absent: 1, tardies: 2 });
  });
});
