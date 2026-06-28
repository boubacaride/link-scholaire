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
