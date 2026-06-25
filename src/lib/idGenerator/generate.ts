// Pure formula for institutional IDs. Mirrors the Postgres
// generate_institutional_id() in supabase/migrations/029_institutional_ids.sql —
// any change here must be matched there (and vice versa). The DB function is
// authoritative at write time (so trigger-driven creation is concurrency-safe),
// this TS version exists for client-side preview, deterministic tests, and
// any non-DB consumer that needs to predict an ID.
//
// Format: [SCHOOL_PREFIX (2)][ROLE_LETTER (1)][6-DIGIT SEQUENCE]
//
//   Akron Masjid  + teacher        + 1   →  "AMT000001"
//   Sahel         + student        + 7   →  "SAS000007"
//   Lycée Moderne + employee       + 42  →  "LME000042"
//   École         + school_admin   + 3   →  "ECA000003"   (accent transliterated)
//   L             + student        + 1   →  "LXS000001"   (1-char name padded)

export type InstitutionalRole = "teacher" | "employee" | "school_admin" | "student";

/** Roles that DO NOT receive an institutional ID. */
const SKIPPED_ROLES = new Set<string>(["parent", "platform_admin"]);

const ROLE_LETTER: Record<InstitutionalRole, string> = {
  teacher: "T",
  employee: "E",
  school_admin: "A",
  student: "S",
};

// Common Latin-1 / Latin-Extended accent transliterations. Mirrors the
// translate() table in the SQL function — keep these two lists in sync.
const ACCENT_MAP: Record<string, string> = {
  "À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","Ā":"A","Ă":"A","Ą":"A",
  "Ç":"C","Ć":"C","Č":"C","Đ":"D",
  "È":"E","É":"E","Ê":"E","Ë":"E","Ē":"E","Ė":"E","Ę":"E",
  "Ì":"I","Í":"I","Î":"I","Ï":"I","Ī":"I",
  "Ñ":"N","Ń":"N",
  "Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","Ō":"O",
  "Ù":"U","Ú":"U","Û":"U","Ü":"U","Ū":"U",
  "Ÿ":"Y","Ý":"Y",
  "Ż":"Z","Ź":"Z",
  "Š":"S","Ş":"S","Ś":"S",
};

const transliterate = (c: string): string => ACCENT_MAP[c] ?? c;

/**
 * Two-letter school prefix.
 *   • 2+ words → first letter of word 1 + first letter of word 2
 *   • 1 word   → first two letters
 *   • 1 char   → first letter + "X"
 *   • 0 chars  → "SX"
 * Non A-Z characters in the result are replaced with "X" so the
 * prefix is always exactly two uppercase letters.
 */
export function computeSchoolPrefix(schoolName: string): string {
  const parts = (schoolName ?? "").trim().split(/\s+/).filter((s) => s.length > 0);
  let prefix: string;
  if (parts.length === 0) return "SX";
  if (parts.length >= 2) {
    prefix = (parts[0][0] ?? "X") + (parts[1][0] ?? "X");
  } else {
    const w = parts[0];
    prefix = (w[0] ?? "X") + (w.length >= 2 ? w[1] : "X");
  }
  // Upper, transliterate accents, drop anything outside A-Z to X.
  const out = Array.from(prefix.toUpperCase())
    .map(transliterate)
    .map((c) => (/^[A-Z]$/.test(c) ? c : "X"))
    .join("");
  return (out + "XX").slice(0, 2);
}

/**
 * Build an institutional ID for the given school + role + sequence.
 * Returns `null` for roles that don't receive an ID (parent, platform_admin).
 *
 * @param schoolName  School's display name, used to derive the prefix.
 * @param role        Profile role string.
 * @param sequence    1-indexed sequence within (school, role). The DB
 *                    trigger computes this from MAX existing + 1; callers
 *                    using this TS function for preview should pass their
 *                    own counter.
 */
export function generateInstitutionalId(
  schoolName: string,
  role: string,
  sequence: number,
): string | null {
  if (SKIPPED_ROLES.has(role)) return null;
  if (!(role in ROLE_LETTER)) return null;
  if (!Number.isFinite(sequence) || sequence < 1) {
    throw new RangeError(`sequence must be a positive integer; got ${sequence}`);
  }
  if (sequence > 999_999) {
    throw new RangeError(`sequence ${sequence} overflows the 6-digit suffix`);
  }
  const prefix = computeSchoolPrefix(schoolName);
  const letter = ROLE_LETTER[role as InstitutionalRole];
  const digits = String(Math.floor(sequence)).padStart(6, "0");
  return `${prefix}${letter}${digits}`;
}

/** Tiny parser: split a known-good ID into its parts. Returns null on a
 *  malformed input — useful for surface-area validation. */
export function parseInstitutionalId(id: string):
  | { schoolPrefix: string; roleLetter: string; sequence: number }
  | null {
  const m = /^([A-Z]{2})([A-Z])([0-9]{6})$/.exec(id);
  if (!m) return null;
  return {
    schoolPrefix: m[1],
    roleLetter:   m[2],
    sequence:     Number(m[3]),
  };
}
