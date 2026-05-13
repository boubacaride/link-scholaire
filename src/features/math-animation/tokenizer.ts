import type { MathToken } from "./types";

const UNICODE_REPLACEMENTS: [string | RegExp, string][] = [
  [/\u2212/g, "-"],   // −
  [/\u00D7/g, "*"],   // ×
  [/\u00B7/g, "*"],   // ·
  [/\u00F7/g, "/"],   // ÷
  [/\s+/g, " "],
];

/**
 * Normalize an equation string by replacing unicode math symbols
 * with their ASCII equivalents and trimming whitespace.
 */
export function normalizeEquation(eq: string): string {
  let result = eq;
  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

/**
 * Determine whether a character is a digit or decimal point.
 */
function isDigitChar(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || ch === ".";
}

/**
 * Determine whether a character is a letter (variable or function name).
 */
function isLetterChar(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

/**
 * Parse one side of an equation into raw term strings.
 * Handles leading negatives, compound terms like "3x", "ln(x)", "-12y".
 * Returns an array of strings where operators (+, -, *, /) are separate entries
 * except when a sign is part of the leading term.
 */
function parseSideTokens(side: string): string[] {
  const trimmed = side.trim();
  if (trimmed.length === 0) return [];

  const results: string[] = [];
  let i = 0;

  while (i < trimmed.length) {
    // Skip spaces
    if (trimmed[i] === " ") {
      i++;
      continue;
    }

    const ch = trimmed[i];

    // Operator characters: +, -, *, /
    if ((ch === "+" || ch === "-" || ch === "*" || ch === "/") && results.length > 0) {
      // Check if this is a binary operator or a sign for the next term
      // It's a sign if followed by a digit/letter/paren and preceded by another operator
      const lastResult = results[results.length - 1];
      const isLastOperator =
        lastResult === "+" || lastResult === "-" || lastResult === "*" || lastResult === "/";

      if ((ch === "+" || ch === "-") && isLastOperator) {
        // This sign attaches to the next term
        let term = ch;
        i++;
        const collected = collectTerm(trimmed, i);
        term += collected.text;
        i = collected.nextIndex;
        results.push(term);
      } else {
        // Binary operator
        results.push(ch);
        i++;
      }
    } else if ((ch === "+" || ch === "-") && results.length === 0) {
      // Leading sign attaches to the first term
      let term = ch;
      i++;
      const collected = collectTerm(trimmed, i);
      term += collected.text;
      i = collected.nextIndex;
      results.push(term);
    } else {
      // Start of a term (number, variable, function, parenthesized group)
      const collected = collectTerm(trimmed, i);
      if (collected.text.length > 0) {
        results.push(collected.text);
      }
      i = collected.nextIndex;
    }
  }

  return results;
}

/**
 * Collect a single compound term starting at position `start`.
 * A compound term can be: digits, digits+letters ("3x"), letters ("x"),
 * function calls ("ln(x)"), or parenthesized groups ("(x+1)").
 * Digits followed immediately by letters or parens merge into one token (e.g. "3x", "2(x+1)").
 */
function collectTerm(
  str: string,
  start: number
): { text: string; nextIndex: number } {
  let i = start;
  let text = "";

  // Skip leading spaces
  while (i < str.length && str[i] === " ") i++;

  if (i >= str.length) return { text: "", nextIndex: i };

  // Collect digits (integer or decimal)
  while (i < str.length && isDigitChar(str[i])) {
    text += str[i];
    i++;
  }

  // Collect letters (variable names, function names like "ln", "sin", etc.)
  while (i < str.length && isLetterChar(str[i])) {
    text += str[i];
    i++;
  }

  // Collect parenthesized group if immediately following
  if (i < str.length && str[i] === "(") {
    let depth = 0;
    while (i < str.length) {
      text += str[i];
      if (str[i] === "(") depth++;
      else if (str[i] === ")") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }
  }

  // If we collected nothing at all (unexpected character), consume one char to avoid infinite loop
  if (text.length === 0 && i < str.length) {
    text = str[i];
    i++;
  }

  return { text, nextIndex: i };
}

/**
 * Build a token id.
 * Left-side tokens: "L{index}_{text}"
 * Right-side tokens: "R{index}_{text}"
 * Equals sign: "EQ"
 */
function makeTokenId(
  side: "left" | "right" | "equals",
  index: number,
  text: string
): string {
  if (side === "equals") return "EQ";
  const prefix = side === "left" ? "L" : "R";
  // Sanitize text for use in id: remove special chars
  const sanitized = text.replace(/[^a-zA-Z0-9]/g, "");
  return `${prefix}${index}_${sanitized || "op"}`;
}

/**
 * Check if a raw token string is an operator.
 */
function isOperator(token: string): boolean {
  return token === "+" || token === "-" || token === "*" || token === "/";
}

/**
 * Tokenize an equation string into an array of MathToken objects.
 *
 * The equation is first normalized (unicode replacements), then split on "=".
 * Each side is parsed into terms and operators. Tokens are assigned unique ids
 * and sequential indices.
 */
export function tokenizeEquation(eq: string): MathToken[] {
  const normalized = normalizeEquation(eq);
  const eqParts = normalized.split("=");

  if (eqParts.length < 2) {
    // No equals sign found -- treat whole string as left side
    const leftRaw = parseSideTokens(eqParts[0]);
    return leftRaw.map((text, i) => ({
      id: makeTokenId("left", i, text),
      text,
      isOperator: isOperator(text),
      side: "left" as const,
      index: i,
    }));
  }

  const leftStr = eqParts[0];
  const rightStr = eqParts.slice(1).join("="); // handle edge case of multiple =

  const leftRaw = parseSideTokens(leftStr);
  const rightRaw = parseSideTokens(rightStr);

  const tokens: MathToken[] = [];
  let globalIndex = 0;

  // Left-side tokens
  for (let i = 0; i < leftRaw.length; i++) {
    const text = leftRaw[i];
    tokens.push({
      id: makeTokenId("left", i, text),
      text,
      isOperator: isOperator(text),
      side: "left",
      index: globalIndex++,
    });
  }

  // Equals sign
  tokens.push({
    id: "EQ",
    text: "=",
    isOperator: false,
    side: "equals",
    index: globalIndex++,
  });

  // Right-side tokens
  for (let i = 0; i < rightRaw.length; i++) {
    const text = rightRaw[i];
    tokens.push({
      id: makeTokenId("right", i, text),
      text,
      isOperator: isOperator(text),
      side: "right",
      index: globalIndex++,
    });
  }

  return tokens;
}
