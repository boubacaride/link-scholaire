import { describe, it, expect } from "vitest";
import { computeAttendanceRate, attendanceRateFromTotals } from "./rate";

describe("computeAttendanceRate (house standard)", () => {
  it("counts present + late as attended", () => {
    expect(computeAttendanceRate({ present: 8, late: 2, absent: 0, excused: 0 })).toBe(100);
    expect(computeAttendanceRate({ present: 9, late: 0, absent: 1, excused: 0 })).toBe(90);
  });
  it("counts excused as missed (in the denominator)", () => {
    // 8 attended of 10 total → 80%, the excused day hurts the rate.
    expect(computeAttendanceRate({ present: 8, late: 0, absent: 0, excused: 2 })).toBe(80);
  });
  it("all-present is 100, all-excused is 0", () => {
    expect(computeAttendanceRate({ present: 10, late: 0, absent: 0, excused: 0 })).toBe(100);
    expect(computeAttendanceRate({ present: 0, late: 0, absent: 0, excused: 5 })).toBe(0);
  });
  it("returns null when there are no sessions", () => {
    expect(computeAttendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull();
  });
  it("late lifts the rate above a present-only count", () => {
    // present-only would read 80%; house standard reads 100% (late attended).
    expect(computeAttendanceRate({ present: 8, late: 2, absent: 0, excused: 0 })).toBe(100);
  });
});

describe("attendanceRateFromTotals", () => {
  it("divides attended by total", () => {
    expect(attendanceRateFromTotals(45, 50)).toBe(90);
  });
  it("returns null on zero/negative total", () => {
    expect(attendanceRateFromTotals(0, 0)).toBeNull();
    expect(attendanceRateFromTotals(3, -1)).toBeNull();
  });
});
