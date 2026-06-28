// Academic performance calculation service (pure, DB-agnostic, unit-tested).
//
// TERMINOLOGY (kept strict — see project spec):
//   • GRADE LEVEL      = a `classes.grade` cohort.
//   • MARK             = one assessment score (score / max_score).
//   • ACADEMIC AVERAGE = a student's flat-mean percentage across their marks
//                        (Σ(score/max·100)/n) — the authoritative dashboard
//                        formula, reused from reportCard/usGrades so every
//                        surface reconciles. NEVER weighted by coefficient.
//
// This module turns student academic averages into per-grade-level statistics:
// mean academic score, a configurable performance-band distribution, and the
// pass rate — all with safe denominators (no division-by-zero → null / "—").

import { overallAveragePercent } from "@/lib/reportCard/usGrades";

/** A student's academic average from their marks. Thin reuse of the
 *  authoritative flat-mean so callers don't duplicate the formula. */
export function studentAcademicAverage(
  marks: { score: number; maxScore: number }[],
): number | null {
  return overallAveragePercent(marks);
}

// ─── Performance bands ───────────────────────────────────────────────
// A band has an inclusive lower bound on the 0–100 percentage scale. Bands
// in a scheme must be listed high→low. `passMin` is the at/above-pass cutoff.

export interface Band {
  key: string;
  label: string;
  /** Inclusive lower bound (percentage). */
  min: number;
}

export interface BandScheme {
  key: string;
  bands: Band[];
  passMin: number;
}

/** US letter bands (base letters, no +/- — distribution is clearer at 5 bands). */
export const LETTER_SCHEME: BandScheme = {
  key: "letter",
  passMin: 60,
  bands: [
    { key: "A", label: "A", min: 90 },
    { key: "B", label: "B", min: 80 },
    { key: "C", label: "C", min: 70 },
    { key: "D", label: "D", min: 60 },
    { key: "F", label: "F", min: 0 },
  ],
};

/** Francophone mentions, mapped onto the 0–100 scale (×5 of the /20 cutoffs). */
export const MENTION_SCHEME: BandScheme = {
  key: "mention",
  passMin: 50,
  bands: [
    { key: "TB", label: "Très Bien", min: 80 },
    { key: "B", label: "Bien", min: 70 },
    { key: "AB", label: "Assez Bien", min: 60 },
    { key: "P", label: "Passable", min: 50 },
    { key: "I", label: "Insuffisant", min: 0 },
  ],
};

/** The band a percentage falls into (first band whose `min` it meets). */
export function bandFor(pct: number, scheme: BandScheme): Band {
  for (const b of scheme.bands) {
    if (pct >= b.min) return b;
  }
  // Bands always include a min:0 floor, so this is unreachable in practice.
  return scheme.bands[scheme.bands.length - 1];
}

export interface BandShare {
  key: string;
  label: string;
  count: number;
  /** Percentage of graded students in this band (0–100). */
  pct: number;
}

export interface GradeLevelStats {
  /** Students considered (enrolled in the level). */
  students: number;
  /** Students with at least one mark (the denominator for averages/bands). */
  graded: number;
  /** Mean of student academic averages, or null when none are graded. */
  academicAverage: number | null;
  /** Band distribution over graded students (counts + % of graded). */
  distribution: BandShare[];
  /** % of graded students at/above passMin, or null when none graded. */
  passRate: number | null;
}

/** Roll up a grade level's student averages into stats. `studentAverages`
 *  has one entry per enrolled student; null = that student has no marks. */
export function gradeLevelStats(
  studentAverages: (number | null)[],
  scheme: BandScheme,
): GradeLevelStats {
  const students = studentAverages.length;
  const graded = studentAverages.filter((v): v is number => v !== null);
  const gradedCount = graded.length;

  const academicAverage =
    gradedCount === 0 ? null : graded.reduce((s, v) => s + v, 0) / gradedCount;

  const counts = new Map<string, number>(scheme.bands.map((b) => [b.key, 0]));
  for (const v of graded) {
    const b = bandFor(v, scheme);
    counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
  }
  const distribution: BandShare[] = scheme.bands.map((b) => {
    const count = counts.get(b.key) ?? 0;
    return {
      key: b.key,
      label: b.label,
      count,
      pct: gradedCount === 0 ? 0 : (count / gradedCount) * 100,
    };
  });

  const passing = graded.filter((v) => v >= scheme.passMin).length;
  const passRate = gradedCount === 0 ? null : (passing / gradedCount) * 100;

  return { students, graded: gradedCount, academicAverage, distribution, passRate };
}

// ─── Comparison + deltas ─────────────────────────────────────────────

export interface LevelAverage {
  gradeLevel: string;
  academicAverage: number | null;
}

/** Strongest / weakest grade level by academic average (graded levels only). */
export function compareGradeLevels(levels: LevelAverage[]): {
  strongest: LevelAverage | null;
  weakest: LevelAverage | null;
} {
  const graded = levels.filter((l): l is LevelAverage & { academicAverage: number } =>
    l.academicAverage !== null,
  );
  if (graded.length === 0) return { strongest: null, weakest: null };
  let strongest = graded[0];
  let weakest = graded[0];
  for (const l of graded) {
    if (l.academicAverage > strongest.academicAverage) strongest = l;
    if (l.academicAverage < weakest.academicAverage) weakest = l;
  }
  return { strongest, weakest };
}

export interface Delta {
  /** current − previous, or null when either side is missing. */
  abs: number | null;
  /** percent change relative to previous, or null when not computable. */
  pct: number | null;
  direction: "up" | "down" | "flat";
}

/** Previous→current delta for a KPI (e.g. month-over-month). */
export function delta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null) {
    return { abs: null, pct: null, direction: "flat" };
  }
  const abs = current - previous;
  const pct = previous === 0 ? null : (abs / Math.abs(previous)) * 100;
  const direction = abs > 0 ? "up" : abs < 0 ? "down" : "flat";
  return { abs, pct, direction };
}
