import { describe, it, expect } from "vitest";
import { calculateTeacherPerformance } from "./teacherScore";

describe("calculateTeacherPerformance", () => {
  it("applies the 70/20/10 blend when all metrics exist", () => {
    // 73.25*.7 + 85*.2 + 66.67*.1 = 51.275 + 17 + 6.667 = 74.942
    expect(calculateTeacherPerformance({ academic: 73.25, attendance: 85, completion: 66.67 }))
      .toBeCloseTo(74.942, 2);
  });
  it("renormalises weights when completion is missing", () => {
    // (73.25*.7 + 85*.2) / .9 = (51.275 + 17)/.9 = 75.86
    expect(calculateTeacherPerformance({ academic: 73.25, attendance: 85, completion: null }))
      .toBeCloseTo((73.25 * 0.7 + 85 * 0.2) / 0.9, 6);
  });
  it("renormalises when only academic exists (→ that value)", () => {
    expect(calculateTeacherPerformance({ academic: 80, attendance: null, completion: null })).toBe(80);
  });
  it("renormalises when attendance is missing", () => {
    expect(calculateTeacherPerformance({ academic: 90, attendance: null, completion: 50 }))
      .toBeCloseTo((90 * 0.7 + 50 * 0.1) / 0.8, 6);
  });
  it("is null when every metric is null", () => {
    expect(calculateTeacherPerformance({ academic: null, attendance: null, completion: null })).toBeNull();
  });
});
