// Aggregates the per-area translation modules and deep-merges them, per
// locale, onto the base dictionaries in translations.ts. Each area module
// (expenses, finance, employees, dashboard, ui, labs) owns its own file so
// the i18n audit could be parallelised without write conflicts.

import { dict as expenses } from "./expenses";
import { dict as finance } from "./finance";
import { dict as employees } from "./employees";
import { dict as dashboard } from "./dashboard";
import { dict as ui } from "./ui";
import { dict as labs } from "./labs";
import { dict as timeoff } from "./timeoff";
import { dict as account } from "./account";

type AnyRecord = Record<string, unknown>;

const MODULES = [expenses, finance, employees, dashboard, ui, labs, timeoff, account];

const isObj = (v: unknown): v is AnyRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Recursively merge `src` into `target` (mutating a fresh copy). */
function deepMerge(target: AnyRecord, src: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...target };
  for (const [k, v] of Object.entries(src)) {
    if (isObj(v) && isObj(out[k])) {
      out[k] = deepMerge(out[k] as AnyRecord, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Merge every area module for a given locale into the base dictionary. */
export function withExtras(locale: "en" | "fr" | "ar", base: AnyRecord): AnyRecord {
  return MODULES.reduce<AnyRecord>(
    (acc, mod) => deepMerge(acc, (mod as Record<string, AnyRecord>)[locale] || {}),
    base
  );
}
