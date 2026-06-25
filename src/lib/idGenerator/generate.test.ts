import { describe, expect, it } from "vitest";
import {
  computeSchoolPrefix,
  generateInstitutionalId,
  parseInstitutionalId,
} from "./generate";

// ─── School prefix ────────────────────────────────────────────────

describe("computeSchoolPrefix", () => {
  it("two-word school: first letter of each word", () => {
    expect(computeSchoolPrefix("Akron Masjid")).toBe("AM");
    expect(computeSchoolPrefix("Lycee Moderne")).toBe("LM");
    expect(computeSchoolPrefix("Link Scholaire")).toBe("LS");
  });

  it("three or more words: still first letter of word 1 + first letter of word 2", () => {
    expect(computeSchoolPrefix("Saint Mary's High School")).toBe("SM");
    expect(computeSchoolPrefix("Lincoln Academy of the Sciences")).toBe("LA");
  });

  it("single-word school: first two letters uppercased", () => {
    expect(computeSchoolPrefix("Sahel")).toBe("SA");
    expect(computeSchoolPrefix("Lincoln")).toBe("LI");
  });

  it("single-character school: pads with X", () => {
    expect(computeSchoolPrefix("L")).toBe("LX");
  });

  it("empty / whitespace school: falls back to SX", () => {
    expect(computeSchoolPrefix("")).toBe("SX");
    expect(computeSchoolPrefix("   ")).toBe("SX");
  });

  it("transliterates accented initials so the prefix stays ASCII A-Z", () => {
    expect(computeSchoolPrefix("École Internationale")).toBe("EI");
    expect(computeSchoolPrefix("Université")).toBe("UN");
    expect(computeSchoolPrefix("Çağaloğlu Lisesi")).toBe("CL");
  });

  it("collapses internal whitespace", () => {
    expect(computeSchoolPrefix("  Akron    Masjid  ")).toBe("AM");
  });

  it("non-letter initials are replaced with X", () => {
    expect(computeSchoolPrefix("123 School")).toBe("XS");
    expect(computeSchoolPrefix("!Special")).toBe("XS");
  });
});

// ─── Worked examples from the spec ────────────────────────────────

describe("generateInstitutionalId — spec worked examples (Akron Masjid)", () => {
  it("teacher #1 → AMT000001", () => {
    expect(generateInstitutionalId("Akron Masjid", "teacher", 1)).toBe("AMT000001");
  });
  it("employee #1 → AME000001", () => {
    expect(generateInstitutionalId("Akron Masjid", "employee", 1)).toBe("AME000001");
  });
  it("administrator (school_admin) #1 → AMA000001", () => {
    expect(generateInstitutionalId("Akron Masjid", "school_admin", 1)).toBe("AMA000001");
  });
  it("student #1 → AMS000001", () => {
    expect(generateInstitutionalId("Akron Masjid", "student", 1)).toBe("AMS000001");
  });
});

// ─── Per-role independence ────────────────────────────────────────

describe("generateInstitutionalId — per-role sequence independence", () => {
  it("teacher and student share a school but maintain independent counters", () => {
    expect(generateInstitutionalId("Sahel", "teacher", 1)).toBe("SAT000001");
    expect(generateInstitutionalId("Sahel", "student", 1)).toBe("SAS000001");
    expect(generateInstitutionalId("Sahel", "teacher", 2)).toBe("SAT000002");
    expect(generateInstitutionalId("Sahel", "student", 7)).toBe("SAS000007");
  });
});

// ─── Padding ──────────────────────────────────────────────────────

describe("generateInstitutionalId — zero-padding", () => {
  it("pads single-digit sequences to 6 places", () => {
    expect(generateInstitutionalId("Akron Masjid", "student", 1))
      .toBe("AMS000001");
    expect(generateInstitutionalId("Akron Masjid", "student", 42))
      .toBe("AMS000042");
    expect(generateInstitutionalId("Akron Masjid", "student", 999_999))
      .toBe("AMS999999");
  });

  it("throws on sequences that overflow 6 digits", () => {
    expect(() => generateInstitutionalId("Akron Masjid", "student", 1_000_000))
      .toThrowError(/overflows/);
  });

  it("rejects non-positive sequences", () => {
    expect(() => generateInstitutionalId("Akron Masjid", "student", 0))
      .toThrowError(/positive/);
    expect(() => generateInstitutionalId("Akron Masjid", "student", -5))
      .toThrowError(/positive/);
    expect(() => generateInstitutionalId("Akron Masjid", "student", NaN))
      .toThrowError(/positive/);
  });

  it("floors fractional sequences before padding", () => {
    expect(generateInstitutionalId("Akron Masjid", "student", 12.9))
      .toBe("AMS000012");
  });
});

// ─── Roles without an ID ──────────────────────────────────────────

describe("generateInstitutionalId — roles that don't get an ID", () => {
  it("returns null for parent", () => {
    expect(generateInstitutionalId("Akron Masjid", "parent", 1)).toBeNull();
  });
  it("returns null for platform_admin", () => {
    expect(generateInstitutionalId("Akron Masjid", "platform_admin", 1)).toBeNull();
  });
  it("returns null for an unknown role string", () => {
    expect(generateInstitutionalId("Akron Masjid", "ghost", 1)).toBeNull();
  });
});

// ─── Concurrency-safety simulation ────────────────────────────────
// The pure function itself is stateless — concurrency safety lives in
// the DB function's FOR UPDATE lock. The test below proves the
// formula's determinism: two callers that pass the same sequence
// must produce the same ID (so the DB's MAX + 1 strategy is what
// protects against collisions, not anything stateful in here).

describe("generateInstitutionalId — determinism (concurrency safety belongs to the DB)", () => {
  it("calling twice with the same inputs returns the same string", () => {
    const a = generateInstitutionalId("Akron Masjid", "student", 100);
    const b = generateInstitutionalId("Akron Masjid", "student", 100);
    expect(a).toBe(b);
  });

  it("when two concurrent DB transactions pick different sequence numbers, the resulting IDs are distinct", () => {
    const a = generateInstitutionalId("Akron Masjid", "student", 100);
    const b = generateInstitutionalId("Akron Masjid", "student", 101);
    expect(a).not.toBe(b);
  });
});

// ─── Round-trip ──────────────────────────────────────────────────

describe("parseInstitutionalId", () => {
  it("round-trips a generated ID", () => {
    const id = generateInstitutionalId("Akron Masjid", "teacher", 123)!;
    const parsed = parseInstitutionalId(id);
    expect(parsed).toEqual({ schoolPrefix: "AM", roleLetter: "T", sequence: 123 });
  });
  it("rejects malformed input", () => {
    expect(parseInstitutionalId("nope")).toBeNull();
    expect(parseInstitutionalId("AMT12345")).toBeNull();    // only 5 digits
    expect(parseInstitutionalId("amt000001")).toBeNull();   // lowercase
    expect(parseInstitutionalId("A1T000001")).toBeNull();   // digit in prefix
  });
});
