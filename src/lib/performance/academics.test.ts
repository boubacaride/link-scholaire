import { describe, it, expect } from "vitest";
import {
  studentAcademicAverage,
  bandFor,
  gradeLevelStats,
  compareGradeLevels,
  delta,
  LETTER_SCHEME,
  MENTION_SCHEME,
} from "./academics";

describe("studentAcademicAverage", () => {
  it("is the flat mean of mark percentages", () => {
    expect(
      studentAcademicAverage([
        { score: 49, maxScore: 50 }, // 98
        { score: 95, maxScore: 100 }, // 95
        { score: 100, maxScore: 100 }, // 100
      ])!.toFixed(1),
    ).toBe("97.7");
  });
  it("is null with no marks", () => {
    expect(studentAcademicAverage([])).toBeNull();
  });
});

describe("bandFor", () => {
  it("maps percentages to letter bands", () => {
    expect(bandFor(90, LETTER_SCHEME).key).toBe("A");
    expect(bandFor(89.9, LETTER_SCHEME).key).toBe("B");
    expect(bandFor(59, LETTER_SCHEME).key).toBe("F");
  });
  it("maps percentages to mention bands", () => {
    expect(bandFor(85, MENTION_SCHEME).label).toBe("Très Bien");
    expect(bandFor(50, MENTION_SCHEME).label).toBe("Passable");
    expect(bandFor(49, MENTION_SCHEME).label).toBe("Insuffisant");
  });
});

describe("gradeLevelStats", () => {
  it("computes average, distribution and pass rate over graded students", () => {
    // 4 students: 95(A), 85(B), 72(C), 40(F). One extra student ungraded (null).
    const s = gradeLevelStats([95, 85, 72, 40, null], LETTER_SCHEME);
    expect(s.students).toBe(5);
    expect(s.graded).toBe(4);
    expect(s.academicAverage).toBeCloseTo((95 + 85 + 72 + 40) / 4, 10); // 73
    // pass = ≥60 → 95,85,72 pass; 40 fails → 75%
    expect(s.passRate).toBe(75);
    const dist = Object.fromEntries(s.distribution.map((d) => [d.key, d]));
    expect(dist["A"].count).toBe(1);
    expect(dist["B"].count).toBe(1);
    expect(dist["C"].count).toBe(1);
    expect(dist["F"].count).toBe(1);
    expect(dist["A"].pct).toBe(25);
    // distribution percentages sum to 100 over graded
    expect(s.distribution.reduce((t, d) => t + d.pct, 0)).toBeCloseTo(100, 10);
  });

  it("handles an empty grade level (no division by zero)", () => {
    const s = gradeLevelStats([], LETTER_SCHEME);
    expect(s.students).toBe(0);
    expect(s.graded).toBe(0);
    expect(s.academicAverage).toBeNull();
    expect(s.passRate).toBeNull();
    expect(s.distribution.every((d) => d.count === 0 && d.pct === 0)).toBe(true);
  });

  it("handles all-ungraded students", () => {
    const s = gradeLevelStats([null, null], LETTER_SCHEME);
    expect(s.students).toBe(2);
    expect(s.graded).toBe(0);
    expect(s.academicAverage).toBeNull();
    expect(s.passRate).toBeNull();
  });

  it("works with the mention scheme and its 50% pass line", () => {
    const s = gradeLevelStats([82, 55, 48], MENTION_SCHEME);
    expect(s.passRate).toBeCloseTo((2 / 3) * 100, 10); // 82,55 pass; 48 fails
    const dist = Object.fromEntries(s.distribution.map((d) => [d.key, d.count]));
    expect(dist["TB"]).toBe(1); // 82
    expect(dist["P"]).toBe(1); // 55
    expect(dist["I"]).toBe(1); // 48
  });
});

describe("compareGradeLevels", () => {
  it("finds strongest and weakest, ignoring ungraded levels", () => {
    const r = compareGradeLevels([
      { gradeLevel: "6", academicAverage: 72 },
      { gradeLevel: "7", academicAverage: 88 },
      { gradeLevel: "8", academicAverage: null },
      { gradeLevel: "9", academicAverage: 65 },
    ]);
    expect(r.strongest?.gradeLevel).toBe("7");
    expect(r.weakest?.gradeLevel).toBe("9");
  });
  it("returns nulls when nothing is graded", () => {
    const r = compareGradeLevels([{ gradeLevel: "6", academicAverage: null }]);
    expect(r.strongest).toBeNull();
    expect(r.weakest).toBeNull();
  });
  it("handles ties deterministically (keeps the first seen)", () => {
    const r = compareGradeLevels([
      { gradeLevel: "6", academicAverage: 80 },
      { gradeLevel: "7", academicAverage: 80 },
    ]);
    expect(r.strongest?.gradeLevel).toBe("6");
    expect(r.weakest?.gradeLevel).toBe("6");
  });
});

describe("delta", () => {
  it("computes absolute and percent change with direction", () => {
    expect(delta(90, 80)).toEqual({ abs: 10, pct: 12.5, direction: "up" });
    expect(delta(70, 80)).toEqual({ abs: -10, pct: -12.5, direction: "down" });
    expect(delta(80, 80)).toEqual({ abs: 0, pct: 0, direction: "flat" });
  });
  it("is null-safe and guards divide-by-zero", () => {
    expect(delta(null, 80).abs).toBeNull();
    expect(delta(90, null).abs).toBeNull();
    expect(delta(5, 0)).toEqual({ abs: 5, pct: null, direction: "up" });
  });
});
