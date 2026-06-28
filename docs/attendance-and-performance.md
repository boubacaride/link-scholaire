# Attendance & Performance — engineering notes

The admin **Attendance & Performance** dashboard combines attendance oversight,
school-wide academic stats, and month-over-month trends, with drill-down from
the whole school to a single student.

This doc covers the foundations that are in place now (the calculation
services and the history layer). The dashboard UI, trend chart, and drill-down
RPCs build on top of these.

## Terminology (used strictly in code, UI, and comments)

| Term | Meaning | Source |
|---|---|---|
| **Grade level** | A cohort / school year (`niveau`). | `classes.grade` (integer) |
| **Mark** / academic score | One assessment score. | `grades.score` / `grades.max_score` |
| **Academic average** / moyenne | A student's flat-mean % across their marks. | computed: `Σ(score/max·100)/n` |
| **Attendance rate** | Attended ÷ scheduled sessions, as %. | computed (house standard) |

Never call a mark a "grade" (grade = the cohort).

## How the numbers compute

### Academic average — `src/lib/performance/academics.ts`
- A student's academic average is the **flat, unweighted mean** of their mark
  percentages — `studentAcademicAverage()`, which reuses
  `overallAveragePercent()` from `src/lib/reportCard/usGrades.ts`. This is the
  same formula as the student dashboard (`student/page.tsx`) and the report
  card, so all three reconcile.
- **Not** weighted by `class_subjects.coefficient` (that column feeds only the
  unused French calculator).
- `gradeLevelStats()` rolls a level's student averages into: mean academic
  average, a **band distribution** (% of graded students per band), and the
  **pass rate** (% at/above the scheme's pass threshold). Denominators are the
  *graded* students; with none graded everything is `null` → render "—".
- Band schemes are configurable: `LETTER_SCHEME` (A–F, pass 60) and
  `MENTION_SCHEME` (Très Bien…Insuffisant, pass 50).
- `compareGradeLevels()` → strongest/weakest level; `delta()` → previous→current
  change (abs, %, direction) for KPI callouts.

### Attendance rate — `src/lib/attendance/rate.ts` (single source of truth)
House standard, matching the student/parent dashboards:

```
attended = present + late
total    = present + late + absent + excused   (excused counts as missed)
rate     = attended / total × 100              (total = 0 → null → "—")
```

`computeAttendanceRate({present, late, absent, excused})` is the canonical
helper; `attendanceRateFromTotals(attended, total)` is for pre-aggregated
callers. **Every** attendance-rate display routes through these:
`Performance.tsx`, `student/page.tsx`, `ChildMonitor.tsx`, `ClassRoster.tsx`.
(`Performance.tsx` previously used a divergent `present/(present+absent…)`
formula that read differently — now unified.)

## History layer — `supabase/migrations/039_performance_snapshots.sql`

Month-over-month comparison needs persisted history (it can't be reconstructed
later), so a monthly snapshot is captured per **school × grade-level × month**,
plus an `'ALL'` whole-school row.

- **Table** `performance_snapshots(school_id, grade_level, period_month,
  academic_average, attendance_rate, students_counted, …)`, unique on
  `(school_id, grade_level, period_month)`. RLS: admins read **only their own
  school** (`is_admin() AND school_id = auth_school_id()`); writes happen only
  via the RPC.
- **RPC** `capture_performance_snapshot(p_month date)` computes that month's
  academic average (flat mean of mark %s, **bucketed by `grades.created_at`** —
  *not* `academic_year`, which is inconsistent in source data) and attendance
  rate (house standard), then **upserts idempotently** (re-running a month
  overwrites, never duplicates). Grade level = student's most recent
  `student_classes` enrollment → `classes.grade`.

### Apply, backfill, schedule
After applying the migration in Supabase:

```sql
-- current month + backfill prior months you have data for
SELECT public.capture_performance_snapshot(date_trunc('month', now())::date);
SELECT public.capture_performance_snapshot('2026-05-01');
SELECT public.capture_performance_snapshot('2026-04-01');

-- verify it populated
SELECT period_month, grade_level, academic_average, attendance_rate, students_counted
FROM public.performance_snapshots ORDER BY period_month, grade_level;
```

The migration also schedules a monthly `pg_cron` job (`monthly-perf-snapshot`,
02:00 on the 1st) when `pg_cron` is available; it's a no-op otherwise. A manual
"recompute this month" admin action calls the same RPC.

> The Trends chart reads **only** from `performance_snapshots`, so it must be
> populated (run the backfill above) before that chart shows data.
