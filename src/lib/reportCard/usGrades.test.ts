import { describe, it, expect } from "vitest";
import {
  percentToLetter,
  averagePercent,
  finalPercent,
  gradeLevelLabel,
} from "./usGrades";

describe("percentToLetter", () => {
  it("maps band edges to the right letters", () => {
    expect(percentToLetter(100)).toBe("A+");
    expect(percentToLetter(97)).toBe("A+");
    expect(percentToLetter(95)).toBe("A");
    expect(percentToLetter(90)).toBe("A-");
    expect(percentToLetter(88)).toBe("B+");
    expect(percentToLetter(85)).toBe("B");
    expect(percentToLetter(80)).toBe("B-");
    expect(percentToLetter(72)).toBe("C-");
    expect(percentToLetter(61)).toBe("D-");
    expect(percentToLetter(59)).toBe("F");
    expect(percentToLetter(0)).toBe("F");
  });
  it("rounds before banding", () => {
    expect(percentToLetter(89.6)).toBe("A-"); // rounds to 90
    expect(percentToLetter(89.4)).toBe("B+"); // rounds to 89
  });
  it("returns an em dash for missing values", () => {
    expect(percentToLetter(null)).toBe("—");
    expect(percentToLetter(undefined)).toBe("—");
    expect(percentToLetter(NaN)).toBe("—");
  });
});

describe("averagePercent", () => {
  it("averages score/maxScore as percentages", () => {
    expect(averagePercent([{ score: 90, maxScore: 100 }])).toBe(90);
    expect(
      averagePercent([
        { score: 80, maxScore: 100 },
        { score: 18, maxScore: 20 }, // 90%
      ]),
    ).toBe(85);
  });
  it("ignores non-positive maxScore and returns null when empty", () => {
    expect(averagePercent([])).toBeNull();
    expect(averagePercent([{ score: 5, maxScore: 0 }])).toBeNull();
  });
});

describe("finalPercent", () => {
  it("averages the two semesters", () => {
    expect(finalPercent(80, 90)).toBe(85);
  });
  it("falls back to whichever semester is present", () => {
    expect(finalPercent(80, null)).toBe(80);
    expect(finalPercent(null, 90)).toBe(90);
    expect(finalPercent(null, null)).toBeNull();
  });
});

describe("gradeLevelLabel", () => {
  it("formats ordinals", () => {
    expect(gradeLevelLabel(1)).toBe("1st Grade");
    expect(gradeLevelLabel(2)).toBe("2nd Grade");
    expect(gradeLevelLabel(3)).toBe("3rd Grade");
    expect(gradeLevelLabel(10)).toBe("10th Grade");
    expect(gradeLevelLabel(11)).toBe("11th Grade");
    expect(gradeLevelLabel(12)).toBe("12th Grade");
  });
  it("handles missing values", () => {
    expect(gradeLevelLabel(null)).toBe("—");
    expect(gradeLevelLabel(undefined)).toBe("—");
  });
});
