import { describe, expect, it } from "vitest";
import { validateDateOfBirth, MAX_AGE_YEARS } from "./dateOfBirth";

const REF = new Date(Date.UTC(2026, 5, 24));   // 2026-06-24

describe("validateDateOfBirth", () => {
  it("rejects empty / missing input", () => {
    expect(validateDateOfBirth(undefined, REF)).toEqual({ ok: false, reason: "empty" });
    expect(validateDateOfBirth("", REF)).toEqual({ ok: false, reason: "empty" });
    expect(validateDateOfBirth(null, REF)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects malformed ISO strings", () => {
    expect(validateDateOfBirth("2010-1-1", REF).reason).toBe("invalid_format");
    expect(validateDateOfBirth("not-a-date", REF).reason).toBe("invalid_format");
    expect(validateDateOfBirth("2025-02-30", REF).reason).toBe("invalid_format"); // round-trip
  });

  it("rejects future dates", () => {
    expect(validateDateOfBirth("2027-01-01", REF).reason).toBe("future");
  });

  it("rejects ages over the max", () => {
    const tooOld = `${REF.getUTCFullYear() - (MAX_AGE_YEARS + 1)}-06-24`;
    expect(validateDateOfBirth(tooOld, REF).reason).toBe("too_old");
  });

  it("accepts a typical student DOB and returns the age", () => {
    const r = validateDateOfBirth("2012-09-10", REF);
    expect(r.ok).toBe(true);
    expect(r.ageYears).toBe(13);
  });

  it("birthday on / one day before / one day after the reference date computes age correctly", () => {
    expect(validateDateOfBirth("2000-06-24", REF).ageYears).toBe(26);    // today
    expect(validateDateOfBirth("2000-06-25", REF).ageYears).toBe(25);    // tomorrow
    expect(validateDateOfBirth("2000-06-23", REF).ageYears).toBe(26);    // yesterday
  });
});
