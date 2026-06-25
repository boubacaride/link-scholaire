// Pure functions powering the approval-triggered notification engine
// for time-off requests. NO I/O, NO Supabase here — those calls live
// in the API route. Pulling the maths into a pure module means we can
// test every overlap edge case without spinning up a database.
//
// Vocabulary
//   • Time-off WINDOW: [startDate, endDate] inclusive. Currently
//     date-only (existing schema). When the form gains time-of-day
//     pickers, extend `windowDays()` to clip the first/last day.
//   • Class SESSION: one occurrence of a lesson row on a specific
//     calendar date. A lesson with day_of_week=1 ("Monday") produces
//     a session on every Monday inside the window.

export interface LessonRow {
  id: string;                    // class_subject row id is fine
  classId: string;
  subjectId: string;
  /** Postgres convention: 0 = Sunday, 1 = Monday, …, 6 = Saturday. */
  dayOfWeek: number;
  /** "HH:MM[:SS]" */
  startTime: string;
  endTime: string;
}

export interface AffectedSession {
  lessonId: string;
  classId: string;
  subjectId: string;
  /** ISO yyyy-mm-dd date the class would have met. */
  date: string;
  startTime: string;             // HH:MM
  endTime: string;
}

// ─── Calendar helpers ────────────────────────────────────────────

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive enumeration of YYYY-MM-DD dates between `start` and
 *  `end`. Returns `[]` if end < start so callers don't need to guard. */
export function windowDays(startISO: string, endISO: string): string[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (end < start) return [];
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(fmtISODate(d));
  }
  return out;
}

/** "HH:MM" of a HH:MM[:SS] string. */
export const trimTime = (t: string): string => t.slice(0, 5);

// ─── Overlap computation ─────────────────────────────────────────

/**
 * Given a set of lessons taught by ONE teacher and a time-off window,
 * return every session that falls inside the window.
 *
 * Currently the existing time_off_requests.start_date / end_date are
 * DATE only, so any lesson on a window day is considered affected.
 * When the schema gains time-of-day, pass `startMinutes` / `endMinutes`
 * to further narrow by clock time on the boundary days.
 */
export function lessonsAffectedByTimeOff(
  lessons: LessonRow[],
  windowStartISO: string,
  windowEndISO: string,
): AffectedSession[] {
  const days = windowDays(windowStartISO, windowEndISO);
  if (days.length === 0 || lessons.length === 0) return [];

  // Bucket lessons by weekday for an O(1) lookup per date.
  const byDow = new Map<number, LessonRow[]>();
  for (const l of lessons) {
    const arr = byDow.get(l.dayOfWeek) ?? [];
    arr.push(l);
    byDow.set(l.dayOfWeek, arr);
  }

  const out: AffectedSession[] = [];
  for (const date of days) {
    const dow = parseISODate(date).getUTCDay();
    const hits = byDow.get(dow);
    if (!hits) continue;
    for (const l of hits) {
      out.push({
        lessonId: l.id,
        classId: l.classId,
        subjectId: l.subjectId,
        date,
        startTime: trimTime(l.startTime),
        endTime:   trimTime(l.endTime),
      });
    }
  }
  return out;
}

// ─── Notification content (privacy-preserving) ───────────────────

/**
 * Build the user-facing notification text for ONE affected session.
 * The Type (Sick/Vacation/Personal) is deliberately omitted — students
 * and parents never see it (privacy spec).
 *
 * Returns { title, message } so the caller can map directly onto the
 * notifications table (title, message).
 */
export function buildNotificationContent(
  teacherName: string,
  subjectName: string,
  session: AffectedSession,
  locale: "en" | "fr" | "ar" = "en",
): { title: string; message: string } {
  const dateLabel = new Date(`${session.date}T00:00:00Z`)
    .toLocaleDateString(locale, {
      weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
    });

  if (locale === "fr") {
    return {
      title: `Absence d'un enseignant — ${subjectName}`,
      message:
        `Votre enseignant·e ${teacherName} sera absent·e pour votre cours ` +
        `de ${subjectName} le ${dateLabel} de ${session.startTime} à ${session.endTime}.`,
    };
  }
  if (locale === "ar") {
    return {
      title: `غياب معلّم — ${subjectName}`,
      message:
        `لن يكون معلّمك ${teacherName} حاضراً لحصة ${subjectName} ` +
        `يوم ${dateLabel} من ${session.startTime} إلى ${session.endTime}.`,
    };
  }
  return {
    title: `Teacher absence — ${subjectName}`,
    message:
      `Your teacher ${teacherName} will not be present for your ${subjectName} ` +
      `class on ${dateLabel} at ${session.startTime} – ${session.endTime}.`,
  };
}
