// Pure functions for report-card maths. No I/O, no Supabase, no DOM — these
// run identically in the browser, an Edge Function, or a Vitest suite.
//
// Two grading scales are supported through a `scaleConfig` parameter:
//   • francophone /20 — Très Bien, Bien, Assez Bien, Passable, Insuffisant
//   • A–F GPA       — A / B / C / D / F mapped to a 4.0 GPA
// `computeMention` reads its thresholds and labels from the scale config
// rather than hardcoding either system.

// ─── Types ────────────────────────────────────────────────────────

export interface Grade {
  /** Raw score the student got on this assessment. */
  score: number;
  /** Maximum possible on this assessment (e.g. 20 or 100). */
  maxScore: number;
  /** Optional pointer to a grade_components row; when present the
   *  component's `weight` is used, otherwise the grade weighs 1. */
  componentId?: string | null;
}

export interface GradeComponent {
  id: string;
  weight: number;
}

export interface SubjectInput {
  /** Stable identifier for the subject (class_subject_id is fine). */
  subjectId: string;
  /** Display label — included in the result for the PDF / UI. */
  subjectName: string;
  /** Coefficient on the overall average. 0 ⇒ excluded. */
  coefficient: number;
  /** Optional component definitions for weighted averaging. */
  components?: GradeComponent[];
  /** Grades earned by the student in this subject for this term. */
  grades: Grade[];
  /** Target scale to normalise to (e.g. 20 for /20). */
  scaleMax: number;
}

export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  /** Normalised subject average on `scaleMax`. `null` when there are
   *  no grades — the subject is rendered as "—" and excluded from the
   *  overall average. */
  average: number | null;
  weightedScore: number | null;       // average × coefficient
}

export interface SubjectStats {
  subjectId: string;
  classAverage: number | null;
  min: number | null;
  max: number | null;
  studentCount: number;
}

export interface RankedStudent {
  studentId: string;
  overall: number | null;
  rank: number | null;                 // 1-based; null if no overall
  classSize: number;
}

export interface MentionConfig {
  /** Lower-bound threshold on the scale; the first matching band wins. */
  threshold: number;
  label: string;
  /** Optional letter grade & GPA for the A-F scale. */
  letter?: string;
  gpa?: number;
  honorRoll?: boolean;
}

export interface ScaleConfig {
  /** Max score the overall is reported on (20, 100, …). */
  max: number;
  /** Pass / fail boundary on `max`. */
  passThreshold: number;
  /** Mention bands in DESCENDING order of threshold. */
  mentions: MentionConfig[];
}

// ─── Default scale configs ────────────────────────────────────────

export const SCALE_FRENCH_20: ScaleConfig = {
  max: 20,
  passThreshold: 10,
  mentions: [
    { threshold: 16, label: "Très Bien", honorRoll: true },
    { threshold: 14, label: "Bien",      honorRoll: true },
    { threshold: 12, label: "Assez Bien" },
    { threshold: 10, label: "Passable" },
    { threshold: 0,  label: "Insuffisant" },
  ],
};

export const SCALE_GPA_4: ScaleConfig = {
  max: 100,
  passThreshold: 60,
  mentions: [
    { threshold: 90, label: "Excellent",       letter: "A", gpa: 4.0, honorRoll: true },
    { threshold: 80, label: "Very Good",       letter: "B", gpa: 3.0, honorRoll: true },
    { threshold: 70, label: "Good",            letter: "C", gpa: 2.0 },
    { threshold: 60, label: "Satisfactory",    letter: "D", gpa: 1.0 },
    { threshold: 0,  label: "Insufficient",    letter: "F", gpa: 0.0 },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────

/** Round to two decimal places without floating-point drift. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

const validNumber = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

// ─── Subject average ──────────────────────────────────────────────

/**
 * Weighted average of grades within a subject, normalised onto
 * `scaleMax`. Returns `null` when there are no usable grades.
 *
 *   • If `components` is provided, each grade is weighted by its
 *     matching component weight (defaulting to 1 if not found).
 *   • Otherwise every grade weighs the same (effectively a plain
 *     average of percentages).
 *
 * Grades with `maxScore <= 0` are skipped (can't normalise).
 */
export function computeSubjectAverage(
  grades: Grade[],
  components?: GradeComponent[],
  scaleMax = 20,
): number | null {
  if (!grades.length) return null;
  const compWeight = new Map<string, number>(
    (components ?? []).map((c) => [c.id, c.weight]),
  );

  let weighted = 0;
  let weightSum = 0;
  for (const g of grades) {
    if (!validNumber(g.score) || !validNumber(g.maxScore) || g.maxScore <= 0) continue;
    const w = g.componentId ? compWeight.get(g.componentId) ?? 1 : 1;
    if (w <= 0) continue;
    const normalised = (g.score / g.maxScore) * scaleMax;
    weighted += normalised * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return round2(weighted / weightSum);
}

/**
 * Multiply a subject average by its coefficient. Returns `null` when
 * the average is missing — caller must handle the gap when summing.
 */
export function computeWeightedScore(
  subjectAverage: number | null,
  coefficient: number,
): number | null {
  if (subjectAverage === null) return null;
  if (!validNumber(coefficient) || coefficient < 0) return null;
  return round2(subjectAverage * coefficient);
}

// ─── Overall average (moyenne générale) ───────────────────────────

/**
 * Σ(avg × coef) ÷ Σ(coef) across all subjects that have an average.
 * Subjects with a `null` average (no grades) are excluded entirely —
 * their coefficient is dropped from the denominator too, so a missing
 * subject neither penalises nor inflates the overall.
 *
 * Returns `null` if no subject contributed.
 */
export function computeOverallAverage(subjectResults: SubjectResult[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const sr of subjectResults) {
    if (sr.average === null) continue;
    if (!validNumber(sr.coefficient) || sr.coefficient <= 0) continue;
    numerator += sr.average * sr.coefficient;
    denominator += sr.coefficient;
  }
  if (denominator === 0) return null;
  return round2(numerator / denominator);
}

// ─── Class ranks ──────────────────────────────────────────────────

/**
 * Standard 1224-ranking ("dense" ranking with ties): two students who
 * tie for 2nd both get rank 2, the next student gets rank 3.
 *
 * Students with a `null` overall are returned with `rank = null` and
 * are NOT counted in the ranked positions — the class_size returned
 * for them is still the full class size for the report header.
 */
export function computeClassRanks(
  allStudentsOverall: { studentId: string; overall: number | null }[],
): RankedStudent[] {
  const classSize = allStudentsOverall.length;
  const ranked = allStudentsOverall
    .filter((s): s is { studentId: string; overall: number } => s.overall !== null)
    .sort((a, b) => b.overall - a.overall);

  const rankOf = new Map<string, number>();
  let currentRank = 0;
  let lastScore: number | null = null;
  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i];
    if (lastScore === null || s.overall < lastScore) {
      currentRank = i + 1;             // jump to position when score drops
      lastScore = s.overall;
    }
    rankOf.set(s.studentId, currentRank);
  }

  return allStudentsOverall.map((s) => ({
    studentId: s.studentId,
    overall: s.overall,
    rank: rankOf.get(s.studentId) ?? null,
    classSize,
  }));
}

// ─── Per-subject stats across the class ───────────────────────────

/**
 * For each subject, compute the class-wide average / min / max of the
 * student subject averages already computed by `computeSubjectAverage`.
 * Students missing a subject are excluded from that subject's stats.
 */
export function computeSubjectStats(
  allStudentsBySubject: { subjectId: string; perStudent: (number | null)[] }[],
): SubjectStats[] {
  return allStudentsBySubject.map(({ subjectId, perStudent }) => {
    const scores = perStudent.filter(validNumber);
    if (!scores.length) {
      return { subjectId, classAverage: null, min: null, max: null, studentCount: 0 };
    }
    const sum = scores.reduce((a, b) => a + b, 0);
    return {
      subjectId,
      classAverage: round2(sum / scores.length),
      min: round2(Math.min(...scores)),
      max: round2(Math.max(...scores)),
      studentCount: scores.length,
    };
  });
}

// ─── Mention / honors ─────────────────────────────────────────────

export interface MentionResult {
  label: string;
  letter?: string;
  gpa?: number;
  honorRoll: boolean;
}

/**
 * Resolve the band the overall average falls into. The first band
 * whose threshold is ≤ overall wins (bands are evaluated in
 * descending threshold order).
 *
 * Returns `null` when there is no overall. Returns the lowest band
 * when overall is below all configured thresholds (e.g. Insuffisant/F).
 */
export function computeMention(
  overallAverage: number | null,
  scaleConfig: ScaleConfig,
): MentionResult | null {
  if (overallAverage === null) return null;
  // Bands MUST be sorted descending for the first-match strategy to be
  // correct regardless of caller-supplied order.
  const sorted = [...scaleConfig.mentions].sort((a, b) => b.threshold - a.threshold);
  const hit = sorted.find((m) => overallAverage >= m.threshold) ?? sorted[sorted.length - 1];
  return {
    label: hit.label,
    letter: hit.letter,
    gpa: hit.gpa,
    honorRoll: hit.honorRoll === true,
  };
}

// ─── Decision (promotion / retention) ─────────────────────────────

export type Decision = "Promoted" | "Retained" | "Conditional" | "Pending";

/**
 * Single-threshold promotion decision.
 *   overall ≥ passThreshold           → Promoted
 *   overall ≥ passThreshold − margin  → Conditional (within `margin` of passing)
 *   below that                        → Retained
 *   overall = null                    → Pending
 */
export function computeDecision(
  overallAverage: number | null,
  passThreshold: number,
  conditionalMargin = 1.0,
): Decision {
  if (overallAverage === null) return "Pending";
  if (overallAverage >= passThreshold) return "Promoted";
  if (overallAverage >= passThreshold - conditionalMargin) return "Conditional";
  return "Retained";
}

// ─── One-shot helper for a single student ─────────────────────────

export interface StudentReportInput {
  studentId: string;
  subjects: SubjectInput[];
}

export interface StudentReportComputed {
  studentId: string;
  subjects: SubjectResult[];
  overall: number | null;
  mention: MentionResult | null;
  decision: Decision;
}

/**
 * Convenience pipeline: take raw subjects for one student, return all
 * computed fields needed for the PDF (subject results, overall,
 * mention, decision). Does NOT include rank / class stats — those need
 * the whole class and live in the batch helper below.
 */
export function computeStudentReport(
  input: StudentReportInput,
  scaleConfig: ScaleConfig,
): StudentReportComputed {
  const subjects: SubjectResult[] = input.subjects.map((s) => {
    const average = computeSubjectAverage(s.grades, s.components, s.scaleMax);
    return {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      coefficient: s.coefficient,
      average,
      weightedScore: computeWeightedScore(average, s.coefficient),
    };
  });

  const overall = computeOverallAverage(subjects);
  const mention = computeMention(overall, scaleConfig);
  const decision = computeDecision(overall, scaleConfig.passThreshold);

  return { studentId: input.studentId, subjects, overall, mention, decision };
}

/**
 * Run `computeStudentReport` over a whole class and attach class ranks
 * + per-subject class stats. Returned in the same order as the input.
 */
export function computeClassReports(
  students: StudentReportInput[],
  scaleConfig: ScaleConfig,
): {
  reports: (StudentReportComputed & { rank: number | null; classSize: number })[];
  subjectStats: SubjectStats[];
} {
  const reports = students.map((s) => computeStudentReport(s, scaleConfig));
  const ranks = computeClassRanks(
    reports.map((r) => ({ studentId: r.studentId, overall: r.overall })),
  );
  const rankMap = new Map(ranks.map((r) => [r.studentId, r]));

  // Build the per-subject score arrays for the stats pass.
  const subjectIds = Array.from(
    new Set(students.flatMap((s) => s.subjects.map((sub) => sub.subjectId))),
  );
  const allStudentsBySubject = subjectIds.map((subjectId) => ({
    subjectId,
    perStudent: reports.map(
      (r) => r.subjects.find((s) => s.subjectId === subjectId)?.average ?? null,
    ),
  }));
  const subjectStats = computeSubjectStats(allStudentsBySubject);

  return {
    reports: reports.map((r) => {
      const rk = rankMap.get(r.studentId);
      return { ...r, rank: rk?.rank ?? null, classSize: rk?.classSize ?? students.length };
    }),
    subjectStats,
  };
}
