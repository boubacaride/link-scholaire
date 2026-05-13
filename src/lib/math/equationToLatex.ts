// Convert plain math expressions to LaTeX format for KaTeX rendering

/**
 * Convert a plain math expression string into LaTeX.
 *
 * Supported conversions:
 *  - x^2 -> x^{2}, x^{2} unchanged
 *  - sqrt(x) -> \sqrt{x}
 *  - pi -> \pi
 *  - * -> \cdot
 *  - fraction-like a/b -> \frac{a}{b}
 *  - trig and log functions
 *  - comparison operators
 *  - infinity -> \infty
 */
export function equationToLatex(expr: string): string {
  let tex = expr.trim();

  // Protect already-braced exponents so we don't double-wrap them.
  // Temporarily replace ^{...} with a placeholder.
  const bracedExponents: string[] = [];
  tex = tex.replace(/\^\{([^}]+)\}/g, (_match, inner) => {
    bracedExponents.push(inner);
    return `^<<BRACED_${bracedExponents.length - 1}>>`;
  });

  // ─── Functions (must come before generic replacements) ───────────

  // sqrt(...)
  tex = tex.replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}");

  // Trig functions: sin, cos, tan, arcsin, arccos, arctan
  // Order matters: arc* before plain versions
  tex = tex.replace(/arcsin/g, "\\arcsin");
  tex = tex.replace(/arccos/g, "\\arccos");
  tex = tex.replace(/arctan/g, "\\arctan");
  tex = tex.replace(/(?<!\\arc)sin/g, "\\sin");
  tex = tex.replace(/(?<!\\arc)cos/g, "\\cos");
  tex = tex.replace(/(?<!\\arc)tan/g, "\\tan");

  // Logarithmic functions
  tex = tex.replace(/\bln\b/g, "\\ln");
  tex = tex.replace(/\blog\b/g, "\\log");

  // ─── Symbols ────────────────────────────────────────────────────

  // pi (as standalone word, not part of another word like "pipe")
  tex = tex.replace(/\bpi\b/g, "\\pi");

  // infinity
  tex = tex.replace(/\binfinity\b/gi, "\\infty");
  tex = tex.replace(/\binf\b/gi, "\\infty");

  // ─── Comparison operators ───────────────────────────────────────

  tex = tex.replace(/>=/g, "\\geq ");
  tex = tex.replace(/<=/g, "\\leq ");
  tex = tex.replace(/!=/g, "\\neq ");

  // ─── Exponents ──────────────────────────────────────────────────

  // Convert bare exponents: x^2 -> x^{2}, x^12 -> x^{12}, x^-3 -> x^{-3}
  // But not already-placeholder ones.
  tex = tex.replace(/\^(-?\d+(?:\.\d+)?)/g, "^{$1}");

  // Single-letter exponents: x^n -> x^{n}
  tex = tex.replace(/\^([a-zA-Z])(?!\w)/g, "^{$1}");

  // Restore protected braced exponents
  tex = tex.replace(/\^<<BRACED_(\d+)>>/g, (_match, idx) => {
    return `^{${bracedExponents[parseInt(idx)]}}`;
  });

  // ─── Fractions ──────────────────────────────────────────────────

  // Convert division between grouped terms: (a+b)/(c+d) -> \frac{a+b}{c+d}
  tex = tex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, "\\frac{$1}{$2}");

  // Convert simple term/term: something/something where terms are
  // numbers, variables, or single-group expressions.
  // Match: number-or-var / number-or-var (not already in a \frac)
  tex = tex.replace(
    /(?<!\\frac\{[^}]*)(?<![a-zA-Z\\])(\d+(?:\.\d+)?|[a-zA-Z](?:\^{[^}]+})?)\/(\d+(?:\.\d+)?|[a-zA-Z](?:\^{[^}]+})?)/g,
    "\\frac{$1}{$2}"
  );

  // ─── Multiplication ─────────────────────────────────────────────

  tex = tex.replace(/\*/g, "\\cdot ");

  // ─── Plus/minus ─────────────────────────────────────────────────

  tex = tex.replace(/\+-/g, "\\pm ");

  // ─── Clean up extra spaces ──────────────────────────────────────

  tex = tex.replace(/\s{2,}/g, " ").trim();

  return tex;
}
