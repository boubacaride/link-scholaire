// Single source of truth for the school ATTENDANCE RATE.
//
// House standard (matches the student dashboard and parent ChildMonitor —
// student/page.tsx & ChildMonitor.tsx — which were the authoritative
// user-facing surfaces):
//
//     attended = present + late
//     total    = present + late + absent + excused      (excused counts as missed)
//     rate     = attended / total * 100
//
// Returns null when there are no sessions (total = 0) so callers can render
// "—" instead of a misleading 0%. Every attendance-rate display in the app
// must route through here so the number reconciles everywhere.

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

/** Low-level form for callers that already hold attended + total (e.g. a
 *  pre-aggregated roster). attended/total*100, or null when total <= 0. */
export function attendanceRateFromTotals(
  attended: number,
  total: number,
): number | null {
  if (total <= 0) return null;
  return (attended / total) * 100;
}

/** House-standard attendance rate from the four status counts. */
export function computeAttendanceRate(counts: AttendanceCounts): number | null {
  const attended = counts.present + counts.late;
  const total = counts.present + counts.late + counts.absent + counts.excused;
  return attendanceRateFromTotals(attended, total);
}
