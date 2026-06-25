// Pure validation for date-of-birth strings (ISO YYYY-MM-DD).
//
// The same rule must be enforced in three places: the registration
// forms (client-side), the create_user_with_profile RPC (server-side),
// and any future bulk-import. Keeping the rule here (and unit-tested)
// means we never let a future-dated or 200-year-old DOB land in
// profiles regardless of which entry point was used.

/** Strictest reasonable upper bound. Anything older is almost
 *  certainly a typo or malicious input. */
export const MAX_AGE_YEARS = 120;

export interface DOBValidationResult {
  ok: boolean;
  reason?: "empty" | "invalid_format" | "future" | "too_old";
  ageYears?: number;
}

/** Parse a YYYY-MM-DD string into a UTC midnight Date, returns null on
 *  malformed input. */
function parseISODate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Round-trip check rejects 2025-02-30 etc.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/** Validate an ISO date-of-birth string against the same rules
 *  enforced by the RPC: not empty, not in the future, not over
 *  MAX_AGE_YEARS old. Returns the computed age on success. */
export function validateDateOfBirth(
  isoString: string | null | undefined,
  /** Inject a reference date in tests so they are deterministic. */
  now: Date = new Date(),
): DOBValidationResult {
  if (!isoString || isoString.length === 0) return { ok: false, reason: "empty" };
  const dob = parseISODate(isoString);
  if (!dob) return { ok: false, reason: "invalid_format" };
  if (dob.getTime() > now.getTime()) return { ok: false, reason: "future" };
  const age =
    now.getUTCFullYear() - dob.getUTCFullYear()
    - (now.getUTCMonth() < dob.getUTCMonth()
       || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())
       ? 1 : 0);
  if (age > MAX_AGE_YEARS) return { ok: false, reason: "too_old", ageYears: age };
  return { ok: true, ageYears: age };
}
