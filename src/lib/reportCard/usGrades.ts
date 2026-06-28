// US-style letter-grade helpers for the classic ("High School Report Card")
// template. Kept framework-free so it can be unit-tested in isolation.

/** Grading-scale legend printed on the card (matches the attached template). */
export const US_GRADING_SCALE: { letter: string; range: string }[] = [
  { letter: "A", range: "90-100%" },
  { letter: "B", range: "80-89%" },
  { letter: "C", range: "70-79%" },
  { letter: "D", range: "60-69%" },
  { letter: "F", range: "Below 60%" },
];

/** Convert a 0-100 percentage into a US letter grade with +/- modifiers.
 *  Returns "—" when there is no grade to convert. */
export function percentToLetter(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
  const p = Math.round(pct);
  if (p >= 97) return "A+";
  if (p >= 93) return "A";
  if (p >= 90) return "A-";
  if (p >= 87) return "B+";
  if (p >= 83) return "B";
  if (p >= 80) return "B-";
  if (p >= 77) return "C+";
  if (p >= 73) return "C";
  if (p >= 70) return "C-";
  if (p >= 67) return "D+";
  if (p >= 63) return "D";
  if (p >= 60) return "D-";
  return "F";
}

/** Average a list of {score, maxScore} marks into a 0-100 percentage.
 *  Marks with a non-positive maxScore are ignored. Returns null when no
 *  usable marks exist (so the caller can render "—"). */
export function averagePercent(
  grades: { score: number; maxScore: number }[],
): number | null {
  const valid = grades.filter((g) => g.maxScore > 0);
  if (valid.length === 0) return null;
  const sum = valid.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0);
  return sum / valid.length;
}

/** Overall average ("moyenne générale") = unweighted mean of EVERY grade-row
 *  percentage, matching the student dashboard's Average (student/page.tsx).
 *  Deliberately not weighted by subject coefficient so the two surfaces
 *  reconcile. Returns null when there are no usable marks. */
export function overallAveragePercent(
  grades: { score: number; maxScore: number }[],
): number | null {
  return averagePercent(grades);
}

/** Final = simple average of whichever semester percentages are present.
 *  If only one semester has data, the final equals that semester. */
export function finalPercent(
  sem1: number | null,
  sem2: number | null,
): number | null {
  const parts = [sem1, sem2].filter((v): v is number => v !== null);
  if (parts.length === 0) return null;
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

// ─── Card row + attendance transforms (pure, DB-agnostic) ────────────
// These take the raw rows the page reads from Supabase and turn them into
// the strings the card renders. Kept here so they can be unit-tested
// without a database.

export interface SubjectMark {
  score: number;
  maxScore: number;
  term: string | null;
}

export interface ComputedSubjectRow {
  subject: string;
  sem1: string;
  sem2: string;
  final: string;
}

/** Compute one subject's row: 1st-semester letter, 2nd-semester letter and
 *  the final (average of the two). When neither semester term is known
 *  (no terms configured), every mark folds into the Final and the two
 *  semester cells show "—". */
export function computeSubjectRow(
  subject: string,
  marks: SubjectMark[],
  sem1Term: string | null,
  sem2Term: string | null,
): ComputedSubjectRow {
  const toMarks = (rows: SubjectMark[]) => rows.map((m) => ({ score: m.score, maxScore: m.maxScore }));
  if (!sem1Term && !sem2Term) {
    const all = averagePercent(toMarks(marks));
    return { subject, sem1: "—", sem2: "—", final: percentToLetter(all) };
  }
  const s1 = sem1Term ? averagePercent(toMarks(marks.filter((m) => m.term === sem1Term))) : null;
  const s2 = sem2Term ? averagePercent(toMarks(marks.filter((m) => m.term === sem2Term))) : null;
  const fin = finalPercent(s1, s2);
  return {
    subject,
    sem1: percentToLetter(s1),
    sem2: percentToLetter(s2),
    final: percentToLetter(fin),
  };
}

/** Tally attendance rows into the card's Present / Absent / Tardies counts.
 *  'late' counts as a tardy; 'excused' is intentionally not surfaced. */
export function countAttendance(
  rows: { status: string }[],
): { present: number; absent: number; tardies: number } {
  const a = { present: 0, absent: 0, tardies: 0 };
  for (const r of rows) {
    if (r.status === "present") a.present += 1;
    else if (r.status === "absent") a.absent += 1;
    else if (r.status === "late") a.tardies += 1;
  }
  return a;
}

/** Format a class grade-level number as an ordinal label, e.g. 10 → "10th Grade". */
export function gradeLevelLabel(grade: number | null | undefined): string {
  if (grade === null || grade === undefined || Number.isNaN(grade)) return "—";
  const n = Math.trunc(grade);
  const rem100 = n % 100;
  const rem10 = n % 10;
  let suffix = "th";
  if (rem100 < 11 || rem100 > 13) {
    if (rem10 === 1) suffix = "st";
    else if (rem10 === 2) suffix = "nd";
    else if (rem10 === 3) suffix = "rd";
  }
  return `${n}${suffix} Grade`;
}
