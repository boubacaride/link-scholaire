import { describe, expect, it } from "vitest";
import {
  windowDays,
  lessonsAffectedByTimeOff,
  buildNotificationContent,
  type LessonRow,
} from "./scheduleOverlap";

const lesson = (over: Partial<LessonRow>): LessonRow => ({
  id: "l1",
  classId: "c1",
  subjectId: "s1",
  dayOfWeek: 1,                 // Monday
  startTime: "08:00:00",
  endTime: "09:00:00",
  ...over,
});

// ─── windowDays ───────────────────────────────────────────────────

describe("windowDays", () => {
  it("returns an inclusive range", () => {
    expect(windowDays("2026-06-22", "2026-06-24")).toEqual([
      "2026-06-22", "2026-06-23", "2026-06-24",
    ]);
  });
  it("single-day window returns one date", () => {
    expect(windowDays("2026-06-22", "2026-06-22")).toEqual(["2026-06-22"]);
  });
  it("returns empty when end < start", () => {
    expect(windowDays("2026-06-24", "2026-06-22")).toEqual([]);
  });
  it("crosses month + year boundaries", () => {
    expect(windowDays("2025-12-31", "2026-01-02")).toEqual([
      "2025-12-31", "2026-01-01", "2026-01-02",
    ]);
  });
});

// ─── lessonsAffectedByTimeOff ─────────────────────────────────────

describe("lessonsAffectedByTimeOff", () => {
  it("Monday lesson + time-off covering that Monday → 1 session", () => {
    // 2026-06-22 is a Monday.
    const sessions = lessonsAffectedByTimeOff(
      [lesson({ dayOfWeek: 1 })],
      "2026-06-22", "2026-06-22",
    );
    expect(sessions.length).toBe(1);
    expect(sessions[0].date).toBe("2026-06-22");
    expect(sessions[0].startTime).toBe("08:00");
    expect(sessions[0].endTime).toBe("09:00");
  });

  it("Tuesday lesson + Monday-only time-off → 0 sessions", () => {
    const sessions = lessonsAffectedByTimeOff(
      [lesson({ dayOfWeek: 2 })],   // Tuesday
      "2026-06-22", "2026-06-22",   // Mon only
    );
    expect(sessions).toEqual([]);
  });

  it("week-long absence with 5 weekday lessons → 5 sessions", () => {
    // Mon-Fri lessons, full week off (Mon-Fri).
    const lessons: LessonRow[] = [1, 2, 3, 4, 5].map((dow) =>
      lesson({ id: `l${dow}`, dayOfWeek: dow }),
    );
    const sessions = lessonsAffectedByTimeOff(
      lessons,
      "2026-06-22", "2026-06-26",   // Mon-Fri inclusive
    );
    expect(sessions.length).toBe(5);
    expect(new Set(sessions.map((s) => s.date))).toEqual(
      new Set(["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"]),
    );
  });

  it("multi-week absence repeats each weekly slot", () => {
    // One lesson on Monday. Time-off covers 2 weeks → 2 Mondays.
    const sessions = lessonsAffectedByTimeOff(
      [lesson({ dayOfWeek: 1 })],
      "2026-06-22", "2026-07-05",
    );
    expect(sessions.length).toBe(2);
    expect(sessions.map((s) => s.date)).toEqual(["2026-06-22", "2026-06-29"]);
  });

  it("returns nothing when the teacher has no lessons", () => {
    expect(lessonsAffectedByTimeOff([], "2026-06-22", "2026-06-26")).toEqual([]);
  });

  it("invalid window (end < start) returns nothing", () => {
    expect(lessonsAffectedByTimeOff([lesson({})], "2026-06-26", "2026-06-22"))
      .toEqual([]);
  });

  it("lesson on Sunday is matched (dayOfWeek = 0)", () => {
    // 2026-06-21 is a Sunday.
    const sessions = lessonsAffectedByTimeOff(
      [lesson({ dayOfWeek: 0 })],
      "2026-06-21", "2026-06-21",
    );
    expect(sessions.length).toBe(1);
    expect(sessions[0].date).toBe("2026-06-21");
  });
});

// ─── buildNotificationContent (privacy) ──────────────────────────

describe("buildNotificationContent — never leaks the absence type", () => {
  const session = {
    lessonId: "l1", classId: "c1", subjectId: "s1",
    date: "2026-06-22", startTime: "08:00", endTime: "09:00",
  };

  it("English message has teacher + subject + date + times, no type word", () => {
    const { title, message } = buildNotificationContent(
      "Mr Brooks", "Algebra II", session, "en",
    );
    expect(title).toBe("Teacher absence — Algebra II");
    expect(message).toContain("Mr Brooks");
    expect(message).toContain("Algebra II");
    expect(message).toContain("08:00");
    expect(message).toContain("09:00");
    // Never mentions the absence type or the reason word.
    for (const banned of ["sick", "Sick", "vacation", "Vacation",
                          "personal", "Personal", "reason"]) {
      expect(message).not.toContain(banned);
    }
  });

  it("French message has the same shape with no type leak", () => {
    const { message } = buildNotificationContent(
      "M. Diop", "Mathématiques", session, "fr",
    );
    expect(message).toContain("M. Diop");
    expect(message).toContain("Mathématiques");
    for (const banned of ["maladie", "Maladie", "vacance", "Vacance",
                          "personnel", "Personnel", "raison"]) {
      expect(message).not.toContain(banned);
    }
  });
});
