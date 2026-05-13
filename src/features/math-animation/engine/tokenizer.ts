// EquationTokenizer: Parses LaTeX/plaintext math into MathToken[] with stable IDs
// Tokens maintain identity across steps for Framer Motion layoutId animation

import type { MathToken, MathTokenKind, EquationState } from "./types";

let globalCounter = 0;

/** Generate a stable token ID from content + position */
function makeId(side: string, index: number, content: string): string {
  return `t_${side}_${index}_${content.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}_${globalCounter++}`;
}

/** Classify a token string into a MathTokenKind */
function classifyToken(text: string): MathTokenKind {
  const trimmed = text.trim();
  if (trimmed === "=") return "equals";
  if (["<", ">", "≤", "≥", "≠", "\\leq", "\\geq", "\\neq"].includes(trimmed)) return "inequality";
  if (["+", "-", "−", "×", "·", "\\cdot", "\\times", "\\pm", "\\mp"].includes(trimmed)) return "operator";
  if (trimmed === "/" || trimmed === "\\frac") return "fraction-bar";
  if (trimmed === "^") return "exponent";
  if (["\\sqrt", "√"].includes(trimmed)) return "radical";
  if (["(", "\\left(", "\\bigl(", "[", "\\left[", "{", "\\left\\{"].includes(trimmed)) return "open-paren";
  if ([")", "\\right)", "\\bigr)", "]", "\\right]", "}", "\\right\\}"].includes(trimmed)) return "close-paren";
  if (["\\sin", "\\cos", "\\tan", "\\cot", "\\sec", "\\csc", "sin", "cos", "tan"].includes(trimmed)) return "trig-fn";
  if (["\\log", "\\ln", "\\exp", "log", "ln"].includes(trimmed)) return "log";
  if (["\\int", "\\iint", "\\oint", "∫"].includes(trimmed)) return "integral";
  if (["\\frac{d}{dx}", "\\frac{d}{dy}", "\\frac{d}{dz}", "\\frac{d^2}{dx^2}"].includes(trimmed)) return "derivative";
  if (["\\sum", "∑"].includes(trimmed)) return "summation";
  if (["\\lim", "lim"].includes(trimmed)) return "limit";
  if (/^[a-zA-Z]$/.test(trimmed)) return "variable";
  if (/^\d+$/.test(trimmed) || /^\d+\.\d+$/.test(trimmed)) return "constant";
  if (/^\d+[a-zA-Z]/.test(trimmed)) return "coefficient";
  if (trimmed === " " || trimmed === "\\," || trimmed === "\\;") return "space";
  if (/^[a-zA-Z]+$/.test(trimmed) && trimmed.length > 1) return "function-name";
  return "text";
}

/** Tokenize a math string (plaintext or simple LaTeX) into MathToken[] */
export function tokenize(input: string, side: "lhs" | "rhs" | "expr" = "expr"): MathToken[] {
  const tokens: MathToken[] = [];
  const str = input.trim();
  if (!str) return tokens;

  // Split into meaningful chunks
  // Match: multi-char functions, numbers (with decimals), operators, variables, LaTeX commands, etc.
  const regex = /\\(?:frac\{[^}]*\}\{[^}]*\}|[a-zA-Z]+)|[a-zA-Z]+\([^)]*\)|[a-zA-Z_]\w*|\d+\.?\d*|[+\-−×·÷=<>≤≥≠^/()[\]{}]|\\[,;!]|\s+/g;
  let match;
  let index = 0;

  while ((match = regex.exec(str)) !== null) {
    const text = match[0].trim();
    if (!text) continue;

    const kind = classifyToken(text);
    tokens.push({
      id: makeId(side, index, text),
      kind,
      latex: text,
      text,
      highlight: null,
      side,
    });
    index++;
  }

  // If regex missed anything, add remaining as text token
  if (tokens.length === 0 && str) {
    tokens.push({
      id: makeId(side, 0, str),
      kind: "text",
      latex: str,
      text: str,
      highlight: null,
      side,
    });
  }

  return tokens;
}

/** Parse a full equation/expression into an EquationState */
export function parseEquation(latex: string): EquationState {
  const hasEquals = latex.includes("=");

  if (hasEquals) {
    const parts = latex.split("=");
    const lhsStr = parts[0]?.trim() || "";
    const rhsStr = parts.slice(1).join("=").trim();

    const lhsTokens = tokenize(lhsStr, "lhs");
    const equalsToken: MathToken = {
      id: `t_eq_${globalCounter++}`,
      kind: "equals",
      latex: "=",
      text: "=",
      highlight: null,
      side: "lhs",
    };
    const rhsTokens = tokenize(rhsStr, "rhs");

    return {
      tokens: [...lhsTokens, equalsToken, ...rhsTokens],
      latex,
      hasEquals: true,
    };
  }

  return {
    tokens: tokenize(latex, "expr"),
    latex,
    hasEquals: false,
  };
}

/** Reset the global counter (for tests) */
export function resetTokenCounter(): void {
  globalCounter = 0;
}
