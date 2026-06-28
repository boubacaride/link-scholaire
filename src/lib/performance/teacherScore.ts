// Teacher performance score for the Teaching Overview.
//
// Blends the metrics already computed by perf_teachers into one 0–100 score:
//   70% average student performance (in the teacher's subjects)
//   20% attendance rate of the teacher's classes
//   10% assignment/exam completion rate
//
// Any metric the school doesn't have yet is null; the score is then the
// weighted mean over WHATEVER metrics exist (weights renormalised), so a
// school with no submissions still gets an academic+attendance score rather
// than a broken/penalised one. Null only when every input is null.

export interface TeacherMetrics {
  academic: number | null;
  attendance: number | null;
  completion: number | null;
}

export const TEACHER_WEIGHTS = { academic: 0.7, attendance: 0.2, completion: 0.1 } as const;

export function calculateTeacherPerformance(m: TeacherMetrics): number | null {
  const parts: Array<[number, number]> = [];
  if (m.academic !== null) parts.push([m.academic, TEACHER_WEIGHTS.academic]);
  if (m.attendance !== null) parts.push([m.attendance, TEACHER_WEIGHTS.attendance]);
  if (m.completion !== null) parts.push([m.completion, TEACHER_WEIGHTS.completion]);
  if (parts.length === 0) return null;
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [v, w]) => s + v * w, 0) / weight;
}
