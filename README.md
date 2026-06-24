# SchoolFlow — Multi-Tenant School Management Platform

A SaaS platform for public and private schools to manage academic operations through role-based dashboards.

## Features

- **5 Role-Based Dashboards** — Platform Admin, School Admin, Teacher, Student, Parent
- **Learning Management System** — Lessons, assignments, classwork with submission tracking
- **Grade Management** — Track scores across all classes and subjects
- **Attendance Tracking** — Daily attendance records with analytics
- **Financial Management** (Private Schools) — Student fees and payroll
- **Real-Time Notifications** — Alerts for grades, submissions, and deadlines
- **Multi-Tenant Architecture** — School-level data isolation with Row-Level Security

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **Charts**: Recharts
- **Calendar**: React Big Calendar
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React

## Getting Started

```bash
npm install
npm run dev
```

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Open [http://localhost:3000](http://localhost:3000)

## Report Cards module

The report-card pipeline lives under `src/lib/reportCard/` and the
admin/teacher UI at `/list/report-cards`. The flow mirrors the real
school workflow: configure → collect grades → calculate → review/lock
→ generate PDF → archive into the student's `My Documents`.

### 1. Apply migrations

`supabase/migrations/027_report_cards.sql` adds `academic_years`,
`terms`, `grade_components`, `subject_remarks`, `report_cards`, a
`coefficient` column on `class_subjects`, RLS, and a trigger that
rejects grade edits on locked terms.

### 2. Configure the school year

Insert one row in `academic_years` and one row per grading period in
`terms` (with `is_locked = false` while teachers are still entering
grades). The generator UI on `/list/report-cards` will refuse to
produce cards until the selected term has `is_locked = true`.

### 3. Set subject coefficients

Every `class_subjects` row has a numeric `coefficient` (default `1`).
For a /20 francophone school you typically set Math/French = 4,
Sciences = 3, Arts = 1, etc. Re-running the generator with new
coefficients re-overwrites the PDF without duplicating documents.

### 4. (Optional) Define grade components

For weighted averages inside a subject (Quiz × 1, Test × 2, Exam × 3),
insert rows in `grade_components` keyed by `class_subject_id`. When
no components exist for a subject, the calculator falls back to a
plain average of the percentages stored in `grades.score / grades.max_score`.

### 5. Pick a grading scale

The page header has a scale switch:

| Key      | Max  | Pass | Mentions / honors                                                |
|---------:|-----:|-----:|------------------------------------------------------------------|
| `fr20`   | /20  | 10   | Très Bien (≥16) · Bien (≥14) · Assez Bien · Passable · Insuffisant |
| `af100`  | /100 | 60   | A (≥90) · B (≥80) · C (≥70) · D (≥60) · F  +  GPA on a 4.0 scale |

Both come from `SCALE_FRENCH_20` / `SCALE_GPA_4` in
`src/lib/reportCard/calculations.ts`. To wire a third school-specific
scale, build a `ScaleConfig` object and pass it as `scaleConfig` to
`generateAll` / `generateOne`.

### 6. Generate

On `/list/report-cards`:

* **Preview** opens the PDF inline (no DB writes).
* **Generate** issues a single student's report card.
* **Generate All** runs the whole class with a live progress bar and
  a green/red summary per student.

Each run is **idempotent**: the storage object at
`student-documents/<school>/<student>/report-cards/<year>-<term>.pdf`
is overwritten, the `student_documents` row is updated in place, and
the `report_cards` row is upserted on `(student_id, term_id)`.

After generation the PDF appears automatically in the student's
**My Documents** tab and the linked parent's view, filterable by
category / academic year / term.

### 7. Run the test suite

```bash
npm test         # one-shot
npm run test:watch
```

The pure calculation library is covered by 32 Vitest tests in
`src/lib/reportCard/calculations.test.ts` — edge cases include
missing grades, zero-coefficient subjects, tied ranks, both grading
scales, and the full end-to-end pipeline.

## License

Private — All rights reserved.
