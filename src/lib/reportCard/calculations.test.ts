import { describe, expect, it } from "vitest";
import {
  computeSubjectAverage,
  computeWeightedScore,
  computeOverallAverage,
  computeClassRanks,
  computeSubjectStats,
  computeMention,
  computeDecision,
  computeClassReports,
  SCALE_FRENCH_20,
  SCALE_GPA_4,
  type SubjectInput,
  type SubjectResult,
} from "./calculations";

// ─── computeSubjectAverage ────────────────────────────────────────

describe("computeSubjectAverage", () => {
  it("returns null when there are no grades", () => {
    expect(computeSubjectAverage([])).toBeNull();
  });

  it("returns null when every grade has maxScore <= 0", () => {
    expect(
      computeSubjectAverage([
        { score: 5, maxScore: 0 },
        { score: 3, maxScore: -1 },
      ]),
    ).toBeNull();
  });

  it("plain average of percentages, normalised to scaleMax=20", () => {
    // 80% + 100% + 50% = 230 / 3 = 76.66...% → on /20 = 15.33
    const avg = computeSubjectAverage(
      [
        { score: 16, maxScore: 20 },
        { score: 20, maxScore: 20 },
        { score: 10, maxScore: 20 },
      ],
      undefined,
      20,
    );
    expect(avg).toBe(15.33);
  });

  it("applies component weights when provided", () => {
    // Final exam is weighted 3, quizzes 1 each → quiz1=50%, quiz2=100%, exam=80%
    // weighted = 0.5*1 + 1.0*1 + 0.8*3 = 3.9, weights = 5 → 0.78 → /20 = 15.6
    const avg = computeSubjectAverage(
      [
        { score: 5,  maxScore: 10, componentId: "quiz1" },
        { score: 10, maxScore: 10, componentId: "quiz2" },
        { score: 8,  maxScore: 10, componentId: "exam"  },
      ],
      [
        { id: "quiz1", weight: 1 },
        { id: "quiz2", weight: 1 },
        { id: "exam",  weight: 3 },
      ],
      20,
    );
    expect(avg).toBe(15.6);
  });

  it("treats unknown component ids as weight=1", () => {
    const avg = computeSubjectAverage(
      [
        { score: 10, maxScore: 20, componentId: "mystery" },
        { score: 20, maxScore: 20, componentId: "mystery" },
      ],
      [],
      20,
    );
    expect(avg).toBe(15);
  });

  it("skips grades whose component has weight=0", () => {
    const avg = computeSubjectAverage(
      [
        { score: 0, maxScore: 20, componentId: "ignore" },   // skipped
        { score: 20, maxScore: 20, componentId: "real" },
      ],
      [
        { id: "ignore", weight: 0 },
        { id: "real",   weight: 1 },
      ],
      20,
    );
    expect(avg).toBe(20);
  });
});

// ─── computeWeightedScore ─────────────────────────────────────────

describe("computeWeightedScore", () => {
  it("multiplies the average by the coefficient", () => {
    expect(computeWeightedScore(15, 4)).toBe(60);
  });
  it("returns null when the subject has no average", () => {
    expect(computeWeightedScore(null, 4)).toBeNull();
  });
  it("returns null on a negative coefficient", () => {
    expect(computeWeightedScore(15, -1)).toBeNull();
  });
  it("zero coefficient still resolves to zero (caller decides to drop)", () => {
    expect(computeWeightedScore(15, 0)).toBe(0);
  });
});

// ─── computeOverallAverage ────────────────────────────────────────

describe("computeOverallAverage", () => {
  const make = (avg: number | null, coef: number, id = "x"): SubjectResult => ({
    subjectId: id,
    subjectName: id,
    coefficient: coef,
    average: avg,
    weightedScore: avg === null ? null : avg * coef,
  });

  it("returns null when no subject contributes", () => {
    expect(computeOverallAverage([])).toBeNull();
    expect(computeOverallAverage([make(null, 2), make(null, 3)])).toBeNull();
  });

  it("drops zero-coefficient subjects from the denominator", () => {
    // 15*4 + 10*0 = 60, denom = 4 (the zero-coef subject drops out)
    // ⇒ overall = 15.0
    expect(computeOverallAverage([make(15, 4), make(10, 0)])).toBe(15);
  });

  it("drops missing-grade subjects so they don't penalise the overall", () => {
    // Math 15 coef 4, Science null coef 2, History 12 coef 1
    // (15*4 + 12*1) / (4 + 1) = 72/5 = 14.4
    expect(
      computeOverallAverage([make(15, 4, "math"), make(null, 2, "sci"), make(12, 1, "hist")]),
    ).toBe(14.4);
  });

  it("rounds to 2dp", () => {
    // 13.333... → 13.33
    expect(computeOverallAverage([make(10, 1), make(20, 2)])).toBe(16.67);
  });
});

// ─── computeClassRanks ────────────────────────────────────────────

describe("computeClassRanks", () => {
  it("ranks distinct overalls 1..N", () => {
    const ranks = computeClassRanks([
      { studentId: "a", overall: 12 },
      { studentId: "b", overall: 18 },
      { studentId: "c", overall: 15 },
    ]);
    const map = new Map(ranks.map((r) => [r.studentId, r.rank]));
    expect(map.get("b")).toBe(1);
    expect(map.get("c")).toBe(2);
    expect(map.get("a")).toBe(3);
    expect(ranks.every((r) => r.classSize === 3)).toBe(true);
  });

  it("ties share the higher rank and the next score jumps to its absolute position", () => {
    // Sorted desc: a=18, b=15, c=15, d=12
    // rank a=1, b=2, c=2, d=4  (d jumps over the shared slot)
    const ranks = computeClassRanks([
      { studentId: "a", overall: 18 },
      { studentId: "b", overall: 15 },
      { studentId: "c", overall: 15 },
      { studentId: "d", overall: 12 },
    ]);
    const map = new Map(ranks.map((r) => [r.studentId, r.rank]));
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(2);
    expect(map.get("d")).toBe(4);
  });

  it("students with null overall are unranked but counted in class_size", () => {
    const ranks = computeClassRanks([
      { studentId: "a", overall: 18 },
      { studentId: "b", overall: null },
      { studentId: "c", overall: 10 },
    ]);
    const map = new Map(ranks.map((r) => [r.studentId, r]));
    expect(map.get("b")?.rank).toBeNull();
    expect(map.get("b")?.classSize).toBe(3);
    expect(map.get("a")?.rank).toBe(1);
    expect(map.get("c")?.rank).toBe(2);
  });

  it("empty class is handled", () => {
    expect(computeClassRanks([])).toEqual([]);
  });
});

// ─── computeSubjectStats ──────────────────────────────────────────

describe("computeSubjectStats", () => {
  it("computes min / max / class average, excludes nulls", () => {
    const stats = computeSubjectStats([
      { subjectId: "math", perStudent: [10, 15, 20, null, 5] },
      { subjectId: "art",  perStudent: [null, null, null] },
    ]);
    const math = stats.find((s) => s.subjectId === "math")!;
    expect(math.min).toBe(5);
    expect(math.max).toBe(20);
    expect(math.classAverage).toBe(12.5);
    expect(math.studentCount).toBe(4);

    const art = stats.find((s) => s.subjectId === "art")!;
    expect(art.classAverage).toBeNull();
    expect(art.min).toBeNull();
    expect(art.max).toBeNull();
    expect(art.studentCount).toBe(0);
  });
});

// ─── computeMention (both scales) ─────────────────────────────────

describe("computeMention — /20 francophone scale", () => {
  it("returns null when overall is null", () => {
    expect(computeMention(null, SCALE_FRENCH_20)).toBeNull();
  });
  it("17 → Très Bien with honorRoll", () => {
    const m = computeMention(17, SCALE_FRENCH_20)!;
    expect(m.label).toBe("Très Bien");
    expect(m.honorRoll).toBe(true);
  });
  it("14 → Bien (boundary inclusive)", () => {
    expect(computeMention(14, SCALE_FRENCH_20)?.label).toBe("Bien");
  });
  it("11.99 → Passable (just below 12)", () => {
    expect(computeMention(11.99, SCALE_FRENCH_20)?.label).toBe("Passable");
  });
  it("3 → Insuffisant", () => {
    const m = computeMention(3, SCALE_FRENCH_20)!;
    expect(m.label).toBe("Insuffisant");
    expect(m.honorRoll).toBe(false);
  });
});

describe("computeMention — A-F GPA scale", () => {
  it("95 → Excellent, letter A, gpa 4.0, honor roll", () => {
    const m = computeMention(95, SCALE_GPA_4)!;
    expect(m.label).toBe("Excellent");
    expect(m.letter).toBe("A");
    expect(m.gpa).toBe(4.0);
    expect(m.honorRoll).toBe(true);
  });
  it("70 → Good, letter C (boundary)", () => {
    const m = computeMention(70, SCALE_GPA_4)!;
    expect(m.letter).toBe("C");
    expect(m.gpa).toBe(2.0);
  });
  it("50 → Insufficient / F", () => {
    const m = computeMention(50, SCALE_GPA_4)!;
    expect(m.letter).toBe("F");
    expect(m.gpa).toBe(0);
  });
});

// ─── computeDecision ──────────────────────────────────────────────

describe("computeDecision", () => {
  it("pending when overall is null", () => {
    expect(computeDecision(null, 10)).toBe("Pending");
  });
  it("promoted at exactly the threshold", () => {
    expect(computeDecision(10, 10)).toBe("Promoted");
  });
  it("conditional within margin (default 1.0)", () => {
    expect(computeDecision(9.5, 10)).toBe("Conditional");
    expect(computeDecision(9.0, 10)).toBe("Conditional");
  });
  it("retained beyond the margin", () => {
    expect(computeDecision(8.99, 10)).toBe("Retained");
  });
});

// ─── computeClassReports (pipeline) ───────────────────────────────

describe("computeClassReports — end-to-end pipeline", () => {
  const subjects: SubjectInput[] = [
    {
      subjectId: "math",
      subjectName: "Math",
      coefficient: 4,
      grades: [{ score: 16, maxScore: 20 }, { score: 18, maxScore: 20 }],
      scaleMax: 20,
    },
    {
      subjectId: "fr",
      subjectName: "Français",
      coefficient: 3,
      grades: [{ score: 14, maxScore: 20 }],
      scaleMax: 20,
    },
  ];

  it("produces overall, rank, mention and decision for a small class", () => {
    const { reports, subjectStats } = computeClassReports(
      [
        { studentId: "alice", subjects },
        { studentId: "bob",   subjects: [
          { ...subjects[0], grades: [{ score: 10, maxScore: 20 }] },
          { ...subjects[1], grades: [{ score: 10, maxScore: 20 }] },
        ]},
        { studentId: "cleo",  subjects: [
          { ...subjects[0], grades: [] },           // no math grade
          { ...subjects[1], grades: [{ score: 18, maxScore: 20 }] },
        ]},
      ],
      SCALE_FRENCH_20,
    );

    const alice = reports.find((r) => r.studentId === "alice")!;
    const bob   = reports.find((r) => r.studentId === "bob")!;
    const cleo  = reports.find((r) => r.studentId === "cleo")!;

    // Alice: math=17, fr=14 → (17*4 + 14*3) / 7 = 110/7 = 15.71
    expect(alice.overall).toBe(15.71);
    expect(alice.mention?.label).toBe("Bien");
    expect(alice.classSize).toBe(3);
    expect(alice.decision).toBe("Promoted");

    // Bob: 10*4 + 10*3 = 70 / 7 = 10
    expect(bob.overall).toBe(10);
    expect(bob.decision).toBe("Promoted");

    // Cleo: math missing → only français contributes ⇒ 18.0, which ranks
    // her AHEAD of Alice. This is the documented behaviour: missing
    // subjects drop out of the overall instead of being treated as 0.
    expect(cleo.overall).toBe(18);
    expect(cleo.rank).toBe(1);
    expect(alice.rank).toBe(2);
    expect(bob.rank).toBe(3);

    // Subject stats for math should exclude Cleo (no grade).
    const mathStats = subjectStats.find((s) => s.subjectId === "math")!;
    expect(mathStats.studentCount).toBe(2);
    expect(mathStats.classAverage).toBe(13.5);   // (17 + 10) / 2
  });
});
