"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type MathSubject =
  | "basicmath"
  | "prealgebra"
  | "algebra"
  | "trigonometry"
  | "precalculus"
  | "calculus"
  | "statistics"
  | "finitemath"
  | "linearalgebra"
  | "chemistry"
  | "physics";

// ─── Shape templates ───────────────────────────────────────────
export interface ShapeTemplate {
  name: string;
  icon: string;
  params: { label: string; symbol: string }[];
}

export interface ShapeSubmitData {
  shape: ShapeTemplate;
  values: Record<string, number>;
}

export interface MathInputHandle {
  clearShape: () => void;
  /** Insert a literal text template (e.g. "sin(□)") at the current
   *  cursor slot. □ placeholders are inserted verbatim — the user replaces
   *  them by typing. Kept for backwards compatibility. */
  insertText: (text: string) => void;
  /** Insert a structured math node (frac, integral, matrix, etc.) at the
   *  current cursor position. The All-Math-Inputs panel uses this to
   *  render proper math typography instead of plain text. */
  insertNode: (descriptor: MathNodeDescriptor) => void;
}

/** Lightweight, JSON-friendly description of a structured math node the
 *  All-Math-Inputs panel can request. Decouples the panel from the
 *  internal ExprNode union (which lives only inside MathInput.tsx). */
export type MathNodeDescriptor =
  | { kind: "frac"; num?: string; den?: string }
  | { kind: "exp"; base?: string; power?: string }
  | { kind: "sub"; base?: string; subscript?: string }
  | { kind: "sqrt" }
  | { kind: "nthrt"; n?: string }
  | { kind: "abs" }
  | { kind: "func"; name: string }
  | { kind: "bigop"; sym: string }                          // Σ, ∏, ∮
  | { kind: "integral"; sym: string; nDvars?: 1 | 2 | 3; withBounds?: boolean }
  | { kind: "lim"; toInfinity?: boolean; side?: "left" | "right" }
  | { kind: "matrix"; rows: number; cols: number };

interface MathInputProps {
  subject?: MathSubject;
  value?: string;
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  onShapeSubmit?: (data: ShapeSubmitData) => void;
  inputRef?: React.RefObject<MathInputHandle | null>;
  className?: string;
}

// ─── Expression Node Types ────────────────────────────────────
type ExprNode =
  | { type: "text"; value: string }
  | { type: "frac"; num: string; den: string }
  | { type: "exp"; base: string; power: string }
  | { type: "sub"; base: string; subscript: string }
  | { type: "sqrt"; content: string }
  | { type: "nthrt"; n: string; content: string }
  | { type: "sci"; coeff: string; power: string }
  | { type: "mixed"; whole: string; num: string; den: string }
  | { type: "coord"; x: string; y: string }
  // Big operator with bounds and integrand/expression: covers Σ, ∏, ∮.
  | { type: "bigop"; sym: string; lower: string; upper: string; body: string }
  // Integral(s): sym is "∫", "∫∫", "∫∫∫" or "∮". For multi-integrals,
  // body is rendered before a "d□ d□ ..." trail (one d-var per ∫).
  | { type: "integral"; sym: string; lower: string; upper: string; body: string; dvar: string; dvar2?: string; dvar3?: string }
  // Limit: lim_{variable → approach} body
  | { type: "lim"; variable: string; approach: string; body: string }
  // Generic function call: name(arg). `name` is a literal (not a slot).
  | { type: "func"; name: string; arg: string }
  // Absolute value |content|
  | { type: "abs"; content: string }
  // Matrix: rows-by-cols grid of editable cells.
  | { type: "matrix"; rows: string[][] };

interface CursorPos {
  nodeIdx: number;
  slotIdx: number; // which slot within the node (0 = first, 1 = second, etc.)
}

function getSlotCount(node: ExprNode): number {
  switch (node.type) {
    case "text": return 1;
    case "frac": return 2;
    case "exp": return 2;
    case "sub": return 2;
    case "sqrt": return 1;
    case "nthrt": return 2;
    case "sci": return 2;
    case "mixed": return 3;
    case "coord": return 2;
    case "bigop": return 3;          // lower, upper, body
    case "integral": {
      // bounds (2) + body + dvar1 + optional dvar2/dvar3
      let n = 4;
      if (node.dvar2 !== undefined) n += 1;
      if (node.dvar3 !== undefined) n += 1;
      return n;
    }
    case "lim": return 3;            // variable, approach, body
    case "func": return 1;           // arg
    case "abs": return 1;            // content
    case "matrix": return node.rows.length * (node.rows[0]?.length ?? 0);
  }
}

function getSlotValue(node: ExprNode, slotIdx: number): string {
  switch (node.type) {
    case "text": return node.value;
    case "frac": return slotIdx === 0 ? node.num : node.den;
    case "exp": return slotIdx === 0 ? node.base : node.power;
    case "sub": return slotIdx === 0 ? node.base : node.subscript;
    case "sqrt": return node.content;
    case "nthrt": return slotIdx === 0 ? node.n : node.content;
    case "sci": return slotIdx === 0 ? node.coeff : node.power;
    case "mixed": return slotIdx === 0 ? node.whole : slotIdx === 1 ? node.num : node.den;
    case "coord": return slotIdx === 0 ? node.x : node.y;
    case "bigop": return slotIdx === 0 ? node.lower : slotIdx === 1 ? node.upper : node.body;
    case "integral": {
      if (slotIdx === 0) return node.lower;
      if (slotIdx === 1) return node.upper;
      if (slotIdx === 2) return node.body;
      if (slotIdx === 3) return node.dvar;
      if (slotIdx === 4) return node.dvar2 ?? "";
      return node.dvar3 ?? "";
    }
    case "lim": return slotIdx === 0 ? node.variable : slotIdx === 1 ? node.approach : node.body;
    case "func": return node.arg;
    case "abs": return node.content;
    case "matrix": {
      const cols = node.rows[0]?.length ?? 0;
      const r = Math.floor(slotIdx / cols);
      const c = slotIdx % cols;
      return node.rows[r]?.[c] ?? "";
    }
  }
}

function setSlotValue(node: ExprNode, slotIdx: number, value: string): ExprNode {
  const n = { ...node };
  switch (n.type) {
    case "text": n.value = value; break;
    case "frac": if (slotIdx === 0) n.num = value; else n.den = value; break;
    case "exp": if (slotIdx === 0) n.base = value; else n.power = value; break;
    case "sub": if (slotIdx === 0) n.base = value; else n.subscript = value; break;
    case "sqrt": n.content = value; break;
    case "nthrt": if (slotIdx === 0) n.n = value; else n.content = value; break;
    case "sci": if (slotIdx === 0) n.coeff = value; else n.power = value; break;
    case "mixed": if (slotIdx === 0) n.whole = value; else if (slotIdx === 1) n.num = value; else n.den = value; break;
    case "coord": if (slotIdx === 0) n.x = value; else n.y = value; break;
    case "bigop":
      if (slotIdx === 0) n.lower = value;
      else if (slotIdx === 1) n.upper = value;
      else n.body = value;
      break;
    case "integral":
      if (slotIdx === 0) n.lower = value;
      else if (slotIdx === 1) n.upper = value;
      else if (slotIdx === 2) n.body = value;
      else if (slotIdx === 3) n.dvar = value;
      else if (slotIdx === 4) n.dvar2 = value;
      else n.dvar3 = value;
      break;
    case "lim":
      if (slotIdx === 0) n.variable = value;
      else if (slotIdx === 1) n.approach = value;
      else n.body = value;
      break;
    case "func": n.arg = value; break;
    case "abs": n.content = value; break;
    case "matrix": {
      const cols = n.rows[0]?.length ?? 0;
      const r = Math.floor(slotIdx / cols);
      const c = slotIdx % cols;
      // Deep-copy the affected row so React sees a new reference.
      const newRows = n.rows.map((row) => [...row]);
      if (newRows[r]) newRows[r][c] = value;
      n.rows = newRows;
      break;
    }
  }
  return n;
}

function nodesToString(nodes: ExprNode[]): string {
  return nodes.map((n) => {
    switch (n.type) {
      case "text": return n.value;
      case "frac": return `${n.num}/${n.den}`;
      case "exp": return `${n.base}^${n.power}`;
      case "sub": return `${n.base}_${n.subscript}`;
      case "sqrt": return `sqrt(${n.content})`;
      case "nthrt": return `nrt(${n.n},${n.content})`;
      case "sci": return `${n.coeff}*10^${n.power}`;
      case "mixed": return `${n.whole} ${n.num}/${n.den}`;
      case "coord": return `(${n.x},${n.y})`;
      case "bigop": {
        const bounds = n.lower || n.upper ? `_(${n.lower})^(${n.upper})` : "";
        return `${n.sym}${bounds} ${n.body}`;
      }
      case "integral": {
        const bounds = n.lower || n.upper ? `_(${n.lower})^(${n.upper})` : "";
        const dvars = [n.dvar, n.dvar2, n.dvar3].filter((v) => v !== undefined).map((v) => `d${v}`).join(" ");
        return `${n.sym}${bounds} ${n.body} ${dvars}`;
      }
      case "lim": return `lim_(${n.variable}→${n.approach}) ${n.body}`;
      case "func": return `${n.name}(${n.arg})`;
      case "abs": return `|${n.content}|`;
      case "matrix": return `[${n.rows.map((r) => `[${r.join(",")}]`).join(",")}]`;
    }
  }).join("");
}

// ─── Keyboard Key Type ────────────────────────────────────────
interface K {
  d: string;          // display label
  v: string;          // value to insert
  s?: "sp" | "ac" | "w2" | "sp-w2" | "ac-w2"; // style variant
  icon?: JSX.Element; // optional icon rendering
}

// ─── SVG Key Icons (Mathway-exact reproductions) ──────────────
function renderKeyIcon(d: string, color: string): JSX.Element | string {
  const s = color; // stroke color
  const w = 24; const h = 22; // viewBox
  switch (d) {
    // Row 1: Rectangle (outline square)
    case "__ICON_RECT__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none"><rect x="4" y="3" width="16" height="16" rx="1" stroke={s} strokeWidth="1.8" /></svg>
    );
    // Row 1: Circle (outline)
    case "__ICON_CIRCLE__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none"><circle cx="12" cy="11" r="8" stroke={s} strokeWidth="1.8" /></svg>
    );
    // Row 1: Triangle (outline)
    case "__ICON_TRI__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none"><polygon points="12,2 3,19 21,19" stroke={s} strokeWidth="1.8" fill="none" strokeLinejoin="round" /></svg>
    );
    // Row 2: Fraction (two bars + line)
    case "__ICON_FRAC__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <rect x="5" y="3" width="14" height="5" rx="1" fill={s} />
        <line x1="4" y1="11" x2="20" y2="11" stroke={s} strokeWidth="1.5" />
        <rect x="5" y="14" width="14" height="5" rx="1" fill={s} />
      </svg>
    );
    // Row 2: Exponent template (filled square + superscript n)
    case "__ICON_EXP__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <rect x="3" y="6" width="12" height="12" rx="1.5" fill={s} />
        <text x="19" y="8" fontSize="9" fontWeight="700" fill={s} textAnchor="middle" fontFamily="serif" fontStyle="italic">n</text>
      </svg>
    );
    // Row 2: Subscript template (filled square + subscript n)
    case "__ICON_SUB__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <rect x="3" y="3" width="12" height="12" rx="1.5" fill={s} />
        <text x="19" y="20" fontSize="9" fontWeight="700" fill={s} textAnchor="middle" fontFamily="serif" fontStyle="italic">n</text>
      </svg>
    );
    // Row 2: Parallelogram
    case "__ICON_PARA__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none"><polygon points="7,3 21,3 17,19 3,19" stroke={s} strokeWidth="1.6" fill="none" strokeLinejoin="round" /></svg>
    );
    // Row 2: Trapezoid
    case "__ICON_TRAP__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none"><polygon points="8,3 16,3 21,19 3,19" stroke={s} strokeWidth="1.6" fill="none" strokeLinejoin="round" /></svg>
    );
    // Row 2: 3D Cube (wireframe)
    case "__ICON_CUBE__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <rect x="2" y="6" width="13" height="13" stroke={s} strokeWidth="1.5" fill="none" />
        <line x1="2" y1="6" x2="8" y2="2" stroke={s} strokeWidth="1.3" />
        <line x1="15" y1="6" x2="21" y2="2" stroke={s} strokeWidth="1.3" />
        <line x1="8" y1="2" x2="21" y2="2" stroke={s} strokeWidth="1.3" />
        <line x1="21" y1="2" x2="21" y2="15" stroke={s} strokeWidth="1.3" />
        <line x1="15" y1="19" x2="21" y2="15" stroke={s} strokeWidth="1.3" />
      </svg>
    );
    // Row 3: Sphere (circle with horizontal band)
    case "__ICON_SPHERE__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <circle cx="12" cy="11" r="8" stroke={s} strokeWidth="1.6" />
        <line x1="4" y1="11" x2="20" y2="11" stroke={s} strokeWidth="1.2" />
        <ellipse cx="12" cy="11" rx="8" ry="3" stroke={s} strokeWidth="0.8" strokeDasharray="2,1.5" fill="none" />
      </svg>
    );
    // Row 3: Cone (triangle + base ellipse)
    case "__ICON_CONE__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <line x1="12" y1="2" x2="4" y2="17" stroke={s} strokeWidth="1.6" />
        <line x1="12" y1="2" x2="20" y2="17" stroke={s} strokeWidth="1.6" />
        <ellipse cx="12" cy="17" rx="8" ry="3" stroke={s} strokeWidth="1.4" fill="none" />
      </svg>
    );
    // Row 3: Cylinder
    case "__ICON_CYL__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <ellipse cx="12" cy="5" rx="7" ry="3" stroke={s} strokeWidth="1.4" fill="none" />
        <line x1="5" y1="5" x2="5" y2="17" stroke={s} strokeWidth="1.4" />
        <line x1="19" y1="5" x2="19" y2="17" stroke={s} strokeWidth="1.4" />
        <ellipse cx="12" cy="17" rx="7" ry="3" stroke={s} strokeWidth="1.4" fill="none" />
      </svg>
    );
    // Row 4: Pyramid
    case "__ICON_PYR__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <line x1="12" y1="1" x2="3" y2="16" stroke={s} strokeWidth="1.6" />
        <line x1="12" y1="1" x2="21" y2="16" stroke={s} strokeWidth="1.6" />
        <line x1="3" y1="16" x2="12" y2="20" stroke={s} strokeWidth="1.4" />
        <line x1="21" y1="16" x2="12" y2="20" stroke={s} strokeWidth="1.4" />
        <line x1="12" y1="1" x2="12" y2="20" stroke={s} strokeWidth="0.8" strokeDasharray="2,2" />
      </svg>
    );
    // Row 4: Scientific notation ×10^n
    case "__ICON_SCI__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <rect x="1" y="5" width="8" height="12" rx="1.5" fill={s} />
        <text x="14" y="16" fontSize="8" fontWeight="600" fill={s} fontFamily="sans-serif">×10</text>
        <text x="23" y="9" fontSize="7" fontWeight="700" fill={s} textAnchor="end" fontFamily="serif" fontStyle="italic">n</text>
      </svg>
    );
    // Row 4: Mixed number (whole + fraction: □ □/□)
    case "__ICON_COMP__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        {/* Whole number box */}
        <rect x="1" y="5" width="8" height="12" rx="1.5" fill={s} />
        {/* Fraction: numerator box */}
        <rect x="12" y="2" width="10" height="6" rx="1" fill={s} />
        {/* Fraction line */}
        <line x1="11" y1="11" x2="23" y2="11" stroke={s} strokeWidth="1.5" />
        {/* Fraction: denominator box */}
        <rect x="12" y="14" width="10" height="6" rx="1" fill={s} />
      </svg>
    );
    // Row 4: Coordinate pair (■,■)
    case "__ICON_COORD__": return (
      <svg width={w} height={h} viewBox="0 0 26 22" fill="none">
        {/* Left paren */}
        <text x="1" y="17" fontSize="16" fontWeight="400" fill={s} fontFamily="serif">(</text>
        {/* First box */}
        <rect x="6" y="5" width="6" height="12" rx="1.5" fill={s} />
        {/* Comma */}
        <text x="13" y="17" fontSize="12" fontWeight="400" fill={s} fontFamily="serif">,</text>
        {/* Second box */}
        <rect x="16" y="5" width="6" height="12" rx="1.5" fill={s} />
        {/* Right paren */}
        <text x="22" y="17" fontSize="16" fontWeight="400" fill={s} fontFamily="serif">)</text>
      </svg>
    );
    // ─── Algebra-specific icons ───────────────────────────
    // Matrix icon — square brackets around 2×2 grid of filled squares
    case "__ICON_ALG_MATRIX__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        {/* Left bracket */}
        <path d="M5,2 L3,2 L3,20 L5,20" stroke={s} strokeWidth="1.8" fill="none" />
        {/* Right bracket */}
        <path d="M19,2 L21,2 L21,20 L19,20" stroke={s} strokeWidth="1.8" fill="none" />
        {/* 2×2 grid of filled squares */}
        <rect x="6" y="4" width="4.5" height="5" rx="0.8" fill={s} />
        <rect x="13" y="4" width="4.5" height="5" rx="0.8" fill={s} />
        <rect x="6" y="13" width="4.5" height="5" rx="0.8" fill={s} />
        <rect x="13" y="13" width="4.5" height="5" rx="0.8" fill={s} />
      </svg>
    );
    // Augmented matrix / x|y grid with separator
    case "__ICON_ALG_XYGRID__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        {/* Outer border */}
        <rect x="2" y="1" width="20" height="20" rx="1.5" stroke={s} strokeWidth="1.5" fill="none" />
        {/* Vertical separator */}
        <line x1="12" y1="1" x2="12" y2="21" stroke={s} strokeWidth="1.2" />
        {/* Horizontal separator */}
        <line x1="2" y1="11" x2="22" y2="11" stroke={s} strokeWidth="1.2" />
        {/* x and y labels */}
        <text x="7" y="8" fontSize="6" fontWeight="600" fill={s} textAnchor="middle" fontFamily="serif" fontStyle="italic">x</text>
        <text x="17" y="8" fontSize="6" fontWeight="600" fill={s} textAnchor="middle" fontFamily="serif" fontStyle="italic">y</text>
      </svg>
    );
    // Scientific notation ■×10■ (algebra style)
    case "__ICON_ALG_SCI__": return (
      <svg width={w} height={h} viewBox="0 0 26 22" fill="none">
        <rect x="1" y="5" width="7" height="12" rx="1.5" fill={s} />
        <text x="11" y="16" fontSize="7" fontWeight="500" fill={s} fontFamily="sans-serif">×10</text>
        <rect x="22" y="2" width="4" height="6" rx="1" fill={s} />
      </svg>
    );
    // Brace/curly bracket icon
    case "__ICON_ALG_BRACE__": return (
      <svg width={w} height={h} viewBox="0 0 24 22" fill="none">
        <text x="5" y="18" fontSize="20" fontWeight="300" fill={s} fontFamily="serif">{"{"}</text>
        <rect x="14" y="4" width="6" height="6" rx="1" fill={s} />
        <rect x="14" y="12" width="6" height="6" rx="1" fill={s} />
      </svg>
    );
    // Log with subscript n
    case "__ICON_ALG_LOGN__": return (
      <svg width={w} height={h} viewBox="0 0 26 22" fill="none">
        <text x="2" y="15" fontSize="11" fontWeight="500" fill={s} fontFamily="sans-serif">log</text>
        <rect x="20" y="13" width="5" height="6" rx="1" fill={s} />
      </svg>
    );
    default:
      return d;
  }
}

// ─── Keyboard Layouts (Mathway-exact) ─────────────────────────
function basicMathKeys(): K[][] {
  return [
    [
      { d: "(", v: "(" }, { d: ")", v: ")" }, { d: "|", v: "|" },
      { d: "[", v: "[" }, { d: "]", v: "]" }, { d: "√", v: "__SQRT__" },
      { d: "ⁿ√", v: "__NTHRT__" }, { d: "≥", v: ">=" },
      { d: "__ICON_RECT__", v: "__SHAPE_RECT__" }, { d: "__ICON_CIRCLE__", v: "__SHAPE_CIRCLE__" },
      { d: "__ICON_TRI__", v: "__SHAPE_TRI__" }, { d: "π", v: "π" },
    ],
    [
      { d: "𝑥", v: "x", s: "sp" }, { d: "7", v: "7" }, { d: "8", v: "8" }, { d: "9", v: "9" },
      { d: "__ICON_FRAC__", v: "__FRAC__" }, { d: "__ICON_EXP__", v: "__EXP__" }, { d: "__ICON_SUB__", v: "__SUB__" }, { d: "≤", v: "<=" },
      { d: "__ICON_PARA__", v: "__SHAPE_PARA__" }, { d: "__ICON_TRAP__", v: "__SHAPE_TRAP__" },
      { d: "__ICON_CUBE__", v: "__SHAPE_CUBE__" }, { d: "𝑒", v: "e" },
    ],
    [
      { d: "𝑦", v: "y", s: "sp" }, { d: "4", v: "4" }, { d: "5", v: "5" }, { d: "6", v: "6" },
      { d: "/", v: "/" }, { d: "^", v: "^" }, { d: "×", v: "*" }, { d: ">", v: ">" },
      { d: "__ICON_SPHERE__", v: "__SHAPE_SPHERE__" }, { d: "__ICON_CONE__", v: "__SHAPE_CONE__" },
      { d: "__ICON_CYL__", v: "__SHAPE_CYL__" }, { d: "!", v: "!" },
    ],
    [
      { d: "𝑧", v: "z", s: "sp" }, { d: "1", v: "1" }, { d: "2", v: "2" }, { d: "3", v: "3" },
      { d: "−", v: "-" }, { d: "+", v: "+" }, { d: "÷", v: "/" }, { d: "<", v: "<" },
      { d: "__ICON_PYR__", v: "__SHAPE_PYR__" }, { d: "__ICON_SCI__", v: "__SCI__" },
      { d: "__ICON_COMP__", v: "__MIXED__" }, { d: "__ICON_COORD__", v: "__COORD__" },
    ],
    [
      { d: "abc", v: "", s: "sp-w2" }, { d: ",", v: "," }, { d: "0", v: "0" },
      { d: ".", v: "." }, { d: "%", v: "%" },
      { d: "⎵", v: " ", s: "w2" }, { d: "=", v: "=" },
      { d: "❮", v: "__LEFT__", s: "ac" }, { d: "❯", v: "__RIGHT__", s: "ac" },
      { d: "⌫", v: "__BACKSPACE__", s: "ac" },
      { d: "↵", v: "__SUBMIT__", s: "ac" },
    ],
  ];
}

function algebraKeys(): K[][] {
  return [
    // Row 1: ( ) | [ ] √ ⁿ√ ≥ [matrix] [xy-grid] f(x) e
    [
      { d: "(", v: "(" }, { d: ")", v: ")" }, { d: "|", v: "|" },
      { d: "[", v: "[" }, { d: "]", v: "]" }, { d: "√", v: "__SQRT__" },
      { d: "ⁿ√", v: "__NTHRT__" }, { d: "≥", v: ">=" },
      { d: "__ICON_ALG_MATRIX__", v: "__MATRIX__" }, { d: "__ICON_ALG_XYGRID__", v: "__COORD__" },
      { d: "f(x)", v: "f(x)=" }, { d: "𝑒", v: "e" },
    ],
    // Row 2: x 7 8 9 [frac] [exp] [sub] ≤ ln [sci] [brace] i
    [
      { d: "𝑥", v: "x", s: "sp" }, { d: "7", v: "7" }, { d: "8", v: "8" }, { d: "9", v: "9" },
      { d: "__ICON_FRAC__", v: "__FRAC__" }, { d: "__ICON_EXP__", v: "__EXP__" },
      { d: "__ICON_SUB__", v: "__SUB__" }, { d: "≤", v: "<=" },
      { d: "ln", v: "ln(" }, { d: "__ICON_ALG_SCI__", v: "__SCI__" },
      { d: "__ICON_ALG_BRACE__", v: "{" }, { d: "𝑖", v: "i" },
    ],
    // Row 3: y 4 5 6 / ^ × > log log_n ∩ ∪
    [
      { d: "𝑦", v: "y", s: "sp" }, { d: "4", v: "4" }, { d: "5", v: "5" }, { d: "6", v: "6" },
      { d: "/", v: "/" }, { d: "^", v: "^" }, { d: "×", v: "*" }, { d: ">", v: ">" },
      { d: "log", v: "log(" }, { d: "__ICON_ALG_LOGN__", v: "log_(" },
      { d: "∩", v: "∩" }, { d: "∪", v: "∪" },
    ],
    // Row 4: z 1 2 3 − + ÷ < [mixed] [coord] π ∞
    [
      { d: "𝑧", v: "z", s: "sp" }, { d: "1", v: "1" }, { d: "2", v: "2" }, { d: "3", v: "3" },
      { d: "−", v: "-" }, { d: "+", v: "+" }, { d: "÷", v: "/" }, { d: "<", v: "<" },
      { d: "__ICON_COMP__", v: "__MIXED__" }, { d: "__ICON_COORD__", v: "__COORD__" },
      { d: "π", v: "π" }, { d: "∞", v: "∞" },
    ],
    // Row 5: abc , 0 . % [space] = ❮ ❯ ⌫ ↵
    [
      { d: "abc", v: "", s: "sp-w2" }, { d: ",", v: "," }, { d: "0", v: "0" },
      { d: ".", v: "." }, { d: "%", v: "%" },
      { d: "⎵", v: " ", s: "w2" }, { d: "=", v: "=" },
      { d: "❮", v: "__LEFT__", s: "ac" }, { d: "❯", v: "__RIGHT__", s: "ac" },
      { d: "⌫", v: "__BACKSPACE__", s: "ac" },
      { d: "↵", v: "__SUBMIT__", s: "ac" },
    ],
  ];
}

function getKeyboard(subject: MathSubject): K[][] {
  switch (subject) {
    case "basicmath": return basicMathKeys();
    case "prealgebra": return basicMathKeys();
    case "algebra": return algebraKeys();
    default: return basicMathKeys();
  }
}

// ─── Shape definitions ────────────────────────────────────────
const SHAPES: Record<string, ShapeTemplate> = {
  __SHAPE_RECT__:   { name: "Rectangle", icon: "▭", params: [{ label: "length", symbol: "l" }, { label: "width", symbol: "w" }] },
  __SHAPE_CIRCLE__: { name: "Circle", icon: "◯", params: [{ label: "radius", symbol: "r" }] },
  __SHAPE_TRI__:    { name: "Triangle", icon: "△", params: [{ label: "base", symbol: "b" }, { label: "height", symbol: "h" }] },
  __SHAPE_PARA__:   { name: "Parallelogram", icon: "▱", params: [{ label: "base", symbol: "b" }, { label: "height", symbol: "h" }] },
  __SHAPE_TRAP__:   { name: "Trapezoid", icon: "⏢", params: [{ label: "base₁", symbol: "a" }, { label: "base₂", symbol: "b" }, { label: "height", symbol: "h" }] },
  __SHAPE_CUBE__:   { name: "Rectangular Prism", icon: "⬜", params: [{ label: "height", symbol: "h" }, { label: "length", symbol: "l" }, { label: "width", symbol: "w" }] },
  __SHAPE_SPHERE__: { name: "Sphere", icon: "⊕", params: [{ label: "radius", symbol: "r" }] },
  __SHAPE_CONE__:   { name: "Cone", icon: "▲", params: [{ label: "height", symbol: "h" }, { label: "radius", symbol: "r" }] },
  __SHAPE_CYL__:    { name: "Cylinder", icon: "⊙", params: [{ label: "radius", symbol: "r" }, { label: "height", symbol: "h" }] },
  __SHAPE_PYR__:    { name: "Pyramid", icon: "⊿", params: [{ label: "height", symbol: "h" }, { label: "slant height", symbol: "l" }, { label: "base width", symbol: "w" }] },
  __SHAPE_COMP__:   { name: "Composite", icon: "⊞", params: [{ label: "area₁", symbol: "A1" }, { label: "area₂", symbol: "A2" }] },
};

// ─── Expression Node Renderer ─────────────────────────────────
function renderNode(
  node: ExprNode,
  nodeIdx: number,
  cursor: CursorPos,
  separator?: boolean,
  onSlotClick?: (nodeIdx: number, slotIdx: number) => void,
): JSX.Element {
  const isActive = (slot: number) => cursor.nodeIdx === nodeIdx && cursor.slotIdx === slot;

  // Empty slot renders as a small soft-yellow filled square (Mathway
  // style); filled slots render the typed content. Active slot keeps the
  // blue underline + blink cursor cues so the user knows where they are.
  const slotBox = (value: string, slotIdx: number, style?: React.CSSProperties) => (
    <span
      key={`${nodeIdx}-${slotIdx}`}
      onClick={(e) => {
        e.stopPropagation();
        onSlotClick?.(nodeIdx, slotIdx);
      }}
      className={`inline-flex items-center justify-center cursor-text rounded-sm ${
        isActive(slotIdx) ? "border-b-2 border-blue-400" : ""
      }`}
      style={{
        padding: value ? "2px 4px" : 0,
        minWidth: value ? 20 : 0,
        minHeight: value ? 18 : 0,
        transition: "background 0.15s",
        background: isActive(slotIdx) ? "rgba(96,165,250,0.15)" : "transparent",
        ...style,
      }}
    >
      {value ? (
        <span style={{ color: "#1a1a2e", fontFamily: "'Georgia', serif", fontSize: 18 }}>{renderSlotContent(value)}</span>
      ) : (
        <span
          aria-label="empty slot"
          style={{
            display: "inline-block", width: 14, height: 14,
            background: "#fde68a", border: "1px solid #facc15",
            borderRadius: 2,
          }}
        />
      )}
      {isActive(slotIdx) && (
        <span className="inline-block w-[2px] h-[1.1em] ml-px animate-[blink_1s_step-end_infinite]" style={{ background: "#2c5aa0" }} />
      )}
    </span>
  );

  const sep = separator ? <span key={`sep-${nodeIdx}`} className="text-gray-300 mx-1">;</span> : null;

  switch (node.type) {
    case "text":
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          {renderTextContent(node.value, isActive(0))}
          {sep}
        </span>
      );

    case "frac":
      return (
        <span key={nodeIdx} className="inline-flex flex-col items-center mx-1" style={{ verticalAlign: "middle" }}>
          <span className="px-1 text-center leading-tight" style={{ fontSize: "0.85em" }}>
            {slotBox(node.num, 0)}
          </span>
          <span style={{ width: "100%", minWidth: 28, height: 2, background: "#94a3b8", borderRadius: 1, margin: "2px 0" }} />
          <span className="px-1 text-center leading-tight" style={{ fontSize: "0.85em" }}>
            {slotBox(node.den, 1)}
          </span>
          {sep}
        </span>
      );

    case "exp":
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          <span>{slotBox(node.base, 0)}</span>
          <sup style={{ fontSize: "0.6em", lineHeight: 1, verticalAlign: "super" }}>
            {slotBox(node.power, 1)}
          </sup>
          {sep}
        </span>
      );

    case "sub":
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          <span>{slotBox(node.base, 0)}</span>
          <sub style={{ fontSize: "0.6em", lineHeight: 1, verticalAlign: "sub" }}>
            {slotBox(node.subscript, 1)}
          </sub>
          {sep}
        </span>
      );

    case "sqrt":
      return (
        <span key={nodeIdx} className="inline-flex items-center">
          <span className="text-gray-700" style={{ fontSize: "1.2em", marginRight: -1 }}>√</span>
          <span className="border-t-2 border-gray-700 px-1" style={{ paddingTop: 1, marginTop: -1 }}>
            {slotBox(node.content, 0)}
          </span>
          {sep}
        </span>
      );

    case "nthrt":
      return (
        <span key={nodeIdx} className="inline-flex items-center">
          <sup style={{ fontSize: "0.55em", marginRight: -2 }}>{slotBox(node.n, 0)}</sup>
          <span className="text-gray-700" style={{ fontSize: "1.2em", marginRight: -1 }}>√</span>
          <span className="border-t-2 border-gray-700 px-1" style={{ paddingTop: 1, marginTop: -1 }}>
            {slotBox(node.content, 1)}
          </span>
          {sep}
        </span>
      );

    case "sci":
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          <span>{slotBox(node.coeff, 0)}</span>
          <span className="mx-0.5">×</span>
          <span>10</span>
          <sup style={{ fontSize: "0.6em", lineHeight: 1, verticalAlign: "super" }}>
            {slotBox(node.power, 1)}
          </sup>
          {sep}
        </span>
      );

    case "mixed":
      return (
        <span key={nodeIdx} className="inline-flex items-center gap-0.5">
          <span>{slotBox(node.whole, 0)}</span>
          <span className="inline-flex flex-col items-center" style={{ verticalAlign: "middle" }}>
            <span className="px-0.5 leading-tight" style={{ fontSize: "0.7em" }}>
              {slotBox(node.num, 1)}
            </span>
            <span className="w-full border-t border-gray-800" style={{ minWidth: 14 }} />
            <span className="px-0.5 leading-tight" style={{ fontSize: "0.7em" }}>
              {slotBox(node.den, 2)}
            </span>
          </span>
          {sep}
        </span>
      );

    case "coord":
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          <span>(</span>
          {slotBox(node.x, 0)}
          <span>,</span>
          {slotBox(node.y, 1)}
          <span>)</span>
          {sep}
        </span>
      );

    case "bigop":
      // Σ / ∏ / ∮ — glyph centered with upper bound above and lower
      // bound below (lower as "i = 0" style), then the body slot.
      return (
        <span key={nodeIdx} className="inline-flex items-center mx-1">
          <span className="inline-flex flex-col items-center" style={{ lineHeight: 1 }}>
            <span style={{ fontSize: "0.65em" }}>{slotBox(node.upper, 1)}</span>
            <span style={{ fontSize: "1.6em", lineHeight: 0.9, color: "#1a1a2e" }}>{node.sym}</span>
            <span style={{ fontSize: "0.65em" }}>{slotBox(node.lower, 0)}</span>
          </span>
          <span style={{ marginLeft: 4 }}>{slotBox(node.body, 2)}</span>
          {sep}
        </span>
      );

    case "integral":
      // ∫ / ∫∫ / ∫∫∫ / ∮ — single tall glyph (or repeated for multi),
      // optional bounds on the right of the sym, then body, then d-vars.
      return (
        <span key={nodeIdx} className="inline-flex items-center mx-1">
          <span style={{ fontSize: "1.8em", lineHeight: 0.9, color: "#1a1a2e", fontFamily: "'Cambria Math', 'Times New Roman', serif" }}>{node.sym}</span>
          {(node.lower || node.upper || isActive(0) || isActive(1)) && (
            <span className="inline-flex flex-col items-start ml-0.5" style={{ lineHeight: 1, fontSize: "0.6em" }}>
              <span>{slotBox(node.upper, 1)}</span>
              <span>{slotBox(node.lower, 0)}</span>
            </span>
          )}
          <span style={{ marginLeft: 4 }}>{slotBox(node.body, 2)}</span>
          <span style={{ marginLeft: 4, fontStyle: "italic" }}>d</span>
          {slotBox(node.dvar, 3)}
          {node.dvar2 !== undefined && (
            <>
              <span style={{ marginLeft: 4, fontStyle: "italic" }}>d</span>
              {slotBox(node.dvar2, 4)}
            </>
          )}
          {node.dvar3 !== undefined && (
            <>
              <span style={{ marginLeft: 4, fontStyle: "italic" }}>d</span>
              {slotBox(node.dvar3, 5)}
            </>
          )}
          {sep}
        </span>
      );

    case "lim":
      // lim_{variable → approach} body
      return (
        <span key={nodeIdx} className="inline-flex items-center mx-1">
          <span className="inline-flex flex-col items-center" style={{ lineHeight: 1 }}>
            <span style={{ fontSize: "1em", fontStyle: "italic", color: "#1a1a2e" }}>lim</span>
            <span className="inline-flex items-center" style={{ fontSize: "0.6em" }}>
              {slotBox(node.variable, 0)}
              <span style={{ margin: "0 2px" }}>→</span>
              {slotBox(node.approach, 1)}
            </span>
          </span>
          <span style={{ marginLeft: 4 }}>{slotBox(node.body, 2)}</span>
          {sep}
        </span>
      );

    case "func":
      // name(arg) — name is a literal label (sin, csc, ln, etc.).
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          <span style={{ color: "#1a1a2e", fontStyle: "italic" }}>{node.name}</span>
          <span>(</span>
          {slotBox(node.arg, 0)}
          <span>)</span>
          {sep}
        </span>
      );

    case "abs":
      return (
        <span key={nodeIdx} className="inline-flex items-baseline">
          <span style={{ color: "#1a1a2e", fontSize: "1.2em" }}>|</span>
          {slotBox(node.content, 0)}
          <span style={{ color: "#1a1a2e", fontSize: "1.2em" }}>|</span>
          {sep}
        </span>
      );

    case "matrix": {
      const cols = node.rows[0]?.length ?? 0;
      return (
        <span key={nodeIdx} className="inline-flex items-center mx-1">
          <span style={{ fontSize: `${1 + node.rows.length * 0.3}em`, color: "#1a1a2e" }}>(</span>
          <span className="inline-grid" style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, auto))`,
            rowGap: 2, columnGap: 4, margin: "0 4px",
          }}>
            {node.rows.flatMap((row, r) =>
              row.map((cell, c) => (
                <span key={`${r}-${c}`} style={{ display: "inline-flex", justifyContent: "center" }}>
                  {slotBox(cell, r * cols + c)}
                </span>
              ))
            )}
          </span>
          <span style={{ fontSize: `${1 + node.rows.length * 0.3}em`, color: "#1a1a2e" }}>)</span>
          {sep}
        </span>
      );
    }
  }
}

// Render plain text with math formatting
function renderTextContent(text: string, isActive: boolean): JSX.Element {
  if (!text && isActive) {
    return <span className="inline-block w-[2px] h-[1em] bg-blue-700 animate-[blink_1s_step-end_infinite]" />;
  }
  const parts: JSX.Element[] = [];
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ("+-".includes(ch)) {
      parts.push(<span key={k++}> {ch === "-" ? "−" : ch} </span>);
    } else if (ch === "*") {
      parts.push(<span key={k++}> × </span>);
    } else if (ch === "=") {
      parts.push(<span key={k++}> = </span>);
    } else if (/[a-zA-Z]/.test(ch)) {
      parts.push(<em key={k++} style={{ fontStyle: "italic" }}>{ch}</em>);
    } else {
      parts.push(<span key={k++}>{ch}</span>);
    }
  }
  if (isActive) {
    parts.push(<span key="cursor" className="inline-block w-[2px] h-[1em] bg-blue-700 ml-px animate-[blink_1s_step-end_infinite]" />);
  }
  return <>{parts}</>;
}

// Render slot content with inline ^ for superscript and _ for subscript
function renderSlotContent(text: string): JSX.Element {
  const parts: JSX.Element[] = [];
  let k = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] === "^" && i + 1 < text.length) {
      i++; // skip ^
      let sup = "";
      // Grab everything after ^ as superscript (digits, letters, dots)
      while (i < text.length && /[\d\w.π]/.test(text[i])) { sup += text[i++]; }
      if (sup) {
        parts.push(<sup key={k++} style={{ fontSize: "0.6em", verticalAlign: "super", lineHeight: 1 }}>{sup}</sup>);
      }
      continue;
    }
    if (text[i] === "_" && i + 1 < text.length) {
      i++;
      let sub = "";
      while (i < text.length && /[\d\w]/.test(text[i])) { sub += text[i++]; }
      if (sub) {
        parts.push(<sub key={k++} style={{ fontSize: "0.6em", verticalAlign: "sub", lineHeight: 1 }}>{sub}</sub>);
      }
      continue;
    }
    if (/[a-zA-Z]/.test(text[i])) {
      parts.push(<em key={k++} style={{ fontStyle: "italic" }}>{text[i]}</em>);
    } else if (text[i] === "*") {
      parts.push(<span key={k++}> × </span>);
    } else {
      parts.push(<span key={k++}>{text[i]}</span>);
    }
    i++;
  }

  return <>{parts}</>;
}

// ─── Shape Diagram SVGs ───────────────────────────────────────
function renderShapeSVG(name: string): JSX.Element {
  switch (name) {
    case "Rectangle":
      return (
        <svg width="120" height="85" viewBox="0 0 120 85" className="flex-shrink-0">
          <rect x="10" y="8" width="100" height="62" fill="none" stroke="#555" strokeWidth="2" />
          <line x1="115" y1="12" x2="115" y2="66" stroke="#999" strokeWidth="1" strokeDasharray="3,3" />
          <line x1="14" y1="75" x2="106" y2="75" stroke="#999" strokeWidth="1" strokeDasharray="3,3" />
        </svg>
      );
    case "Circle":
      return (
        <svg width="90" height="90" viewBox="0 0 90 90" className="flex-shrink-0">
          <circle cx="45" cy="45" r="36" fill="none" stroke="#555" strokeWidth="2" />
          <line x1="45" y1="45" x2="81" y2="45" stroke="#999" strokeWidth="1.5" strokeDasharray="3,3" />
          <circle cx="45" cy="45" r="2.5" fill="#555" />
        </svg>
      );
    case "Triangle":
      return (
        <svg width="110" height="85" viewBox="0 0 110 85" className="flex-shrink-0">
          <polygon points="55,8 8,76 102,76" fill="none" stroke="#555" strokeWidth="2" />
          <line x1="55" y1="12" x2="55" y2="74" stroke="#999" strokeWidth="1.5" strokeDasharray="3,3" />
        </svg>
      );
    case "Rectangular Prism":
      return (
        <svg width="120" height="95" viewBox="0 0 120 95" className="flex-shrink-0">
          {/* Front face */}
          <rect x="5" y="28" width="70" height="55" fill="none" stroke="#444" strokeWidth="2" />
          {/* Top face */}
          <polygon points="5,28 30,8 100,8 75,28" fill="none" stroke="#444" strokeWidth="1.8" />
          {/* Right face */}
          <line x1="75" y1="28" x2="75" y2="83" stroke="#444" strokeWidth="2" />
          <line x1="100" y1="8" x2="100" y2="58" stroke="#444" strokeWidth="1.8" />
          <line x1="75" y1="83" x2="100" y2="58" stroke="#444" strokeWidth="1.8" />
          {/* Hidden back edges (dashed) */}
          <line x1="30" y1="8" x2="30" y2="58" stroke="#aaa" strokeWidth="1" strokeDasharray="4,3" />
          <line x1="5" y1="83" x2="30" y2="58" stroke="#aaa" strokeWidth="1" strokeDasharray="4,3" />
          <line x1="30" y1="58" x2="100" y2="58" stroke="#aaa" strokeWidth="1" strokeDasharray="4,3" />
          {/* Dimension labels */}
          <text x="36" y="92" fontSize="12" fill="#555" fontStyle="italic" fontFamily="Georgia,serif">w</text>
          <text x="104" y="36" fontSize="12" fill="#555" fontStyle="italic" fontFamily="Georgia,serif">h</text>
          <text x="50" y="6" fontSize="12" fill="#555" fontStyle="italic" fontFamily="Georgia,serif">l</text>
        </svg>
      );
    case "Cone":
      return (
        <svg width="100" height="95" viewBox="0 0 100 95" className="flex-shrink-0">
          {/* Cone outline */}
          <line x1="50" y1="8" x2="12" y2="78" stroke="#555" strokeWidth="2" />
          <line x1="50" y1="8" x2="88" y2="78" stroke="#555" strokeWidth="2" />
          {/* Base ellipse */}
          <ellipse cx="50" cy="78" rx="38" ry="10" fill="none" stroke="#555" strokeWidth="2" />
          {/* Height dashed line */}
          <line x1="50" y1="12" x2="50" y2="76" stroke="#999" strokeWidth="1.5" strokeDasharray="3,3" />
          {/* Radius dashed line */}
          <line x1="50" y1="78" x2="88" y2="78" stroke="#999" strokeWidth="1" strokeDasharray="3,3" />
          <circle cx="50" cy="78" r="2" fill="#555" />
          <text x="52" y="48" fontSize="10" fill="#777" fontStyle="italic">h</text>
          <text x="68" y="75" fontSize="10" fill="#777" fontStyle="italic">r</text>
        </svg>
      );
    case "Sphere":
      return (
        <svg width="90" height="90" viewBox="0 0 90 90" className="flex-shrink-0">
          <circle cx="45" cy="45" r="38" fill="none" stroke="#555" strokeWidth="2" />
          <ellipse cx="45" cy="45" rx="38" ry="12" fill="none" stroke="#999" strokeWidth="1" strokeDasharray="3,2" />
          <line x1="45" y1="45" x2="83" y2="45" stroke="#999" strokeWidth="1.5" strokeDasharray="3,3" />
          <circle cx="45" cy="45" r="2" fill="#555" />
        </svg>
      );
    case "Cylinder":
      return (
        <svg width="90" height="100" viewBox="0 0 90 100" className="flex-shrink-0">
          <ellipse cx="45" cy="18" rx="35" ry="10" fill="none" stroke="#555" strokeWidth="2" />
          <line x1="10" y1="18" x2="10" y2="78" stroke="#555" strokeWidth="2" />
          <line x1="80" y1="18" x2="80" y2="78" stroke="#555" strokeWidth="2" />
          <ellipse cx="45" cy="78" rx="35" ry="10" fill="none" stroke="#555" strokeWidth="2" />
          <line x1="45" y1="20" x2="45" y2="76" stroke="#999" strokeWidth="1" strokeDasharray="3,3" />
        </svg>
      );
    case "Pyramid":
      return (
        <svg width="100" height="95" viewBox="0 0 100 95" className="flex-shrink-0">
          {/* Edges */}
          <line x1="50" y1="8" x2="10" y2="75" stroke="#444" strokeWidth="2" />
          <line x1="50" y1="8" x2="90" y2="75" stroke="#444" strokeWidth="2" />
          <line x1="10" y1="75" x2="50" y2="90" stroke="#444" strokeWidth="2" />
          <line x1="90" y1="75" x2="50" y2="90" stroke="#444" strokeWidth="2" />
          {/* Height (dashed) */}
          <line x1="50" y1="8" x2="50" y2="82" stroke="#999" strokeWidth="1.5" strokeDasharray="3,3" />
          {/* Base (dashed) */}
          <line x1="10" y1="75" x2="90" y2="75" stroke="#999" strokeWidth="1" strokeDasharray="3,2" />
          {/* Labels */}
          <text x="38" y="45" fontSize="11" fill="#333" fontStyle="italic" fontFamily="Georgia,serif">h</text>
          <text x="25" y="90" fontSize="11" fill="#333" fontStyle="italic" fontFamily="Georgia,serif">w</text>
          <text x="75" y="90" fontSize="11" fill="#333" fontStyle="italic" fontFamily="Georgia,serif">l</text>
        </svg>
      );
    default:
      return (
        <svg width="80" height="70" viewBox="0 0 80 70" className="flex-shrink-0">
          <text x="40" y="45" textAnchor="middle" fontSize="32" fill="#bbb">?</text>
        </svg>
      );
  }
}

// ─── Main Component ───────────────────────────────────────────
export default function MathInput({
  subject = "basicmath",
  value,
  onChange,
  onSubmit,
  onShapeSubmit,
  inputRef: externalRef,
  className = "",
}: MathInputProps) {
  const [nodes, setNodes] = useState<ExprNode[]>([{ type: "text", value: value || "" }]);
  const [cursor, setCursor] = useState<CursorPos>({ nodeIdx: 0, slotIdx: 0 });
  const [activeTab, setActiveTab] = useState(0);

  // Shape mode state
  const [activeShape, setActiveShape] = useState<ShapeTemplate | null>(null);
  const [shapeValues, setShapeValues] = useState<Record<string, string>>({});
  const [activeParamIdx, setActiveParamIdx] = useState(0);

  // Matrix mode state
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixRows, setMatrixRows] = useState(3);
  const [matrixCols, setMatrixCols] = useState(3);
  const [showAllMath, setShowAllMath] = useState(false);
  const [matrixData, setMatrixData] = useState<string[][] | null>(null);
  const [matrixActiveCell, setMatrixActiveCell] = useState<[number, number]>([0, 0]);

  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const keyboard = getKeyboard(subject);

  // Plain text value derived from nodes (for the real input field)
  const plainTextValue = nodesToString(nodes);

  // Focus the input
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => hiddenInputRef.current?.focus());
  }, []);

  // Sync text output to parent
  const syncToParent = useCallback((n: ExprNode[]) => {
    onChange?.(nodesToString(n));
  }, [onChange]);

  const hasContent = nodes.some((n) => {
    if (n.type === "text") return n.value.length > 0;
    return true;
  }) || activeShape;

  // True when there are structured nodes (fractions, exponents, etc.) that need visual rendering
  const hasTemplateNodes = nodes.some((n) => n.type !== "text");

  // Clear shape
  const clearShape = useCallback(() => {
    setActiveShape(null);
    setShapeValues({});
    setActiveParamIdx(0);
  }, []);

  // Expose handle methods via ref. `insertText` / `insertNode` are wired
  // below the `typeChar` definition; we capture stable wrappers here
  // that read the latest closure on every call.
  const insertTextRef = useRef<(text: string) => void>(() => {});
  const insertNodeRef = useRef<(desc: MathNodeDescriptor) => void>(() => {});
  useEffect(() => {
    if (externalRef && typeof externalRef === "object") {
      (externalRef as React.MutableRefObject<MathInputHandle | null>).current = {
        clearShape,
        insertText: (text: string) => insertTextRef.current(text),
        insertNode: (desc: MathNodeDescriptor) => insertNodeRef.current(desc),
      };
    }
  });

  // Reset on subject change
  useEffect(() => {
    setNodes([{ type: "text", value: "" }]);
    setCursor({ nodeIdx: 0, slotIdx: 0 });
    clearShape();
    onChange?.("");
  }, [subject]);

  // ── Navigation ──
  // Ensures there's always a text node to land on when exiting a template
  const ensureTextNodeAfter = (nodeIdx: number): { nodes: ExprNode[]; idx: number } => {
    const newNodes = [...nodes];
    const nextIdx = nodeIdx + 1;
    // If next node exists and is a text node, go there
    if (nextIdx < newNodes.length && newNodes[nextIdx].type === "text") {
      return { nodes: newNodes, idx: nextIdx };
    }
    // Otherwise insert a new empty text node after current
    newNodes.splice(nextIdx, 0, { type: "text", value: "" });
    setNodes(newNodes);
    syncToParent(newNodes);
    return { nodes: newNodes, idx: nextIdx };
  };

  const ensureTextNodeBefore = (nodeIdx: number): { nodes: ExprNode[]; idx: number } => {
    const newNodes = [...nodes];
    const prevIdx = nodeIdx - 1;
    if (prevIdx >= 0 && newNodes[prevIdx].type === "text") {
      return { nodes: newNodes, idx: prevIdx };
    }
    // Insert a new empty text node before current
    newNodes.splice(nodeIdx, 0, { type: "text", value: "" });
    setNodes(newNodes);
    syncToParent(newNodes);
    return { nodes: newNodes, idx: nodeIdx }; // the new node is at nodeIdx, old node shifted right
  };

  const moveLeft = () => {
    if (activeShape) {
      if (activeParamIdx > 0) setActiveParamIdx(activeParamIdx - 1);
      return;
    }
    // Move to previous slot within the same node
    if (cursor.slotIdx > 0) {
      setCursor({ ...cursor, slotIdx: cursor.slotIdx - 1 });
      return;
    }
    // At first slot — move to previous node
    if (cursor.nodeIdx > 0) {
      const prevNode = nodes[cursor.nodeIdx - 1];
      setCursor({ nodeIdx: cursor.nodeIdx - 1, slotIdx: getSlotCount(prevNode) - 1 });
    }
  };

  const moveRight = () => {
    if (activeShape) {
      if (activeParamIdx < activeShape.params.length - 1) setActiveParamIdx(activeParamIdx + 1);
      return;
    }
    const curNode = nodes[cursor.nodeIdx];
    // Move to next slot within the same node
    if (cursor.slotIdx < getSlotCount(curNode) - 1) {
      setCursor({ ...cursor, slotIdx: cursor.slotIdx + 1 });
      return;
    }
    // At last slot of a template node — exit to next text node
    if (curNode.type !== "text") {
      const { idx } = ensureTextNodeAfter(cursor.nodeIdx);
      setCursor({ nodeIdx: idx, slotIdx: 0 });
      return;
    }
    // At a text node — move to next node
    if (cursor.nodeIdx < nodes.length - 1) {
      setCursor({ nodeIdx: cursor.nodeIdx + 1, slotIdx: 0 });
    }
  };

  // ── Check if cursor is inside a non-text node slot ──
  const isInsideTemplate = (): boolean => {
    return nodes[cursor.nodeIdx]?.type !== "text";
  };

  // ── Insert template ──
  const insertTemplate = (type: ExprNode["type"]) => {
    // If cursor is inside a template slot, insert the symbol inline instead of creating a new node
    if (isInsideTemplate()) {
      const inlineMap: Record<string, string> = { frac: "/", exp: "^", sub: "_", sqrt: "√(", nthrt: "√(", sci: "×10^", mixed: " ", coord: "," };
      const inlineChar = inlineMap[type];
      if (inlineChar) {
        typeChar(inlineChar);
        return;
      }
    }

    let newNode: ExprNode;
    switch (type) {
      case "frac": newNode = { type: "frac", num: "", den: "" }; break;
      case "exp": newNode = { type: "exp", base: "", power: "" }; break;
      case "sub": newNode = { type: "sub", base: "", subscript: "" }; break;
      case "sqrt": newNode = { type: "sqrt", content: "" }; break;
      case "nthrt": newNode = { type: "nthrt", n: "", content: "" }; break;
      case "sci": newNode = { type: "sci", coeff: "", power: "" }; break;
      case "mixed": newNode = { type: "mixed", whole: "", num: "", den: "" }; break;
      case "coord": newNode = { type: "coord", x: "", y: "" }; break;
      default: return;
    }

    const newNodes = [...nodes];
    // Insert after current node
    newNodes.splice(cursor.nodeIdx + 1, 0, newNode);
    setNodes(newNodes);
    setCursor({ nodeIdx: cursor.nodeIdx + 1, slotIdx: 0 });
    syncToParent(newNodes);
  };

  // ── Type character ──
  const typeChar = (ch: string) => {
    if (activeShape) {
      const param = activeShape.params[activeParamIdx];
      setShapeValues({ ...shapeValues, [param.symbol]: (shapeValues[param.symbol] || "") + ch });
      return;
    }

    const curNode = nodes[cursor.nodeIdx];
    const currentVal = getSlotValue(curNode, cursor.slotIdx);
    const updatedNode = setSlotValue(curNode, cursor.slotIdx, currentVal + ch);
    const newNodes = [...nodes];
    newNodes[cursor.nodeIdx] = updatedNode;
    setNodes(newNodes);
    syncToParent(newNodes);
  };

  // Append an entire template at the current cursor slot in one state
  // update (looping `typeChar` would only see the stale `nodes` snapshot
  // on each call). □ placeholders are inserted verbatim and the user
  // replaces them by typing.
  const insertText = (text: string) => {
    if (!text) return;
    if (activeShape) {
      const param = activeShape.params[activeParamIdx];
      setShapeValues({ ...shapeValues, [param.symbol]: (shapeValues[param.symbol] || "") + text });
      return;
    }
    const curNode = nodes[cursor.nodeIdx];
    const currentVal = getSlotValue(curNode, cursor.slotIdx);
    const updatedNode = setSlotValue(curNode, cursor.slotIdx, currentVal + text);
    const newNodes = [...nodes];
    newNodes[cursor.nodeIdx] = updatedNode;
    setNodes(newNodes);
    syncToParent(newNodes);
  };
  // Keep the ref pointed at the latest closure so the imperative handle
  // sees the current `nodes` / `cursor` / `activeShape` on every call.
  insertTextRef.current = insertText;

  // Build a fresh ExprNode from a MathNodeDescriptor and splice it after
  // the current cursor node, then jump the cursor into the first slot
  // (matches how `insertTemplate` behaves for the legacy keyboard).
  // Honors optional pre-fills (e.g. □² → power:"2", ∛□ → n:"3", lim⁺ →
  // approach pre-seeded with "⁺"). When the cursor is parked inside a
  // non-text slot (e.g. a fraction's numerator), top-level node
  // insertion would silently add a sibling instead of filling that slot
  // — so we fall back to appending a textual representation of the
  // template to the current slot, the same shape `insertText` would
  // produce. Imperfect for deeply nested templates but matches user
  // intent ("the symbol I picked lands where my cursor is").
  const fallbackText = (desc: MathNodeDescriptor): string => {
    switch (desc.kind) {
      case "frac":   return `${desc.num ?? "□"}/${desc.den ?? "□"}`;
      case "exp":    return `${desc.base ?? "□"}^${desc.power ?? "□"}`;
      case "sub":    return `${desc.base ?? "□"}_${desc.subscript ?? "□"}`;
      case "sqrt":   return `sqrt(□)`;
      case "nthrt":  return `${desc.n ?? "□"}√(□)`;
      case "abs":    return `|□|`;
      case "func":   return `${desc.name}(□)`;
      case "bigop":  return `${desc.sym}_(□)^(□) □`;
      case "integral": {
        const n = desc.nDvars ?? 1;
        return `${desc.sym} □ ${Array.from({ length: n }, () => "d□").join(" ")}`;
      }
      case "lim": {
        const a = desc.toInfinity ? "∞"
          : desc.side === "left" ? "□⁻"
          : desc.side === "right" ? "□⁺"
          : "□";
        return `lim_(□→${a}) □`;
      }
      case "matrix": {
        const row = Array.from({ length: desc.cols }, () => "□").join(",");
        return `[${Array.from({ length: desc.rows }, () => `[${row}]`).join(",")}]`;
      }
    }
  };

  const insertNode = (desc: MathNodeDescriptor) => {
    // Cursor inside a non-text slot → fall back to text-style insertion
    // into that slot, matching the existing keyboard's behavior.
    if (nodes[cursor.nodeIdx]?.type !== "text") {
      insertText(fallbackText(desc));
      return;
    }

    let newNode: ExprNode;
    switch (desc.kind) {
      case "frac":
        newNode = { type: "frac", num: desc.num ?? "", den: desc.den ?? "" };
        break;
      case "exp":
        newNode = { type: "exp", base: desc.base ?? "", power: desc.power ?? "" };
        break;
      case "sub":
        newNode = { type: "sub", base: desc.base ?? "", subscript: desc.subscript ?? "" };
        break;
      case "sqrt": newNode = { type: "sqrt", content: "" }; break;
      case "nthrt":
        newNode = { type: "nthrt", n: desc.n ?? "", content: "" };
        break;
      case "abs": newNode = { type: "abs", content: "" }; break;
      case "func": newNode = { type: "func", name: desc.name, arg: "" }; break;
      case "bigop":
        newNode = { type: "bigop", sym: desc.sym, lower: "", upper: "", body: "" };
        break;
      case "integral": {
        const n: ExprNode = {
          type: "integral", sym: desc.sym,
          lower: "", upper: "", body: "", dvar: "",
        };
        if ((desc.nDvars ?? 1) >= 2) (n as any).dvar2 = "";
        if ((desc.nDvars ?? 1) >= 3) (n as any).dvar3 = "";
        newNode = n;
        break;
      }
      case "lim": {
        // Side variants pre-seed approach with a superscript marker so
        // the user types the limit value before it (lim⁺: "→ □⁺"). The
        // toInfinity variant fills the whole approach value.
        const approach = desc.toInfinity ? "∞"
          : desc.side === "left" ? "⁻"
          : desc.side === "right" ? "⁺"
          : "";
        newNode = { type: "lim", variable: "", approach, body: "" };
        break;
      }
      case "matrix":
        newNode = {
          type: "matrix",
          rows: Array.from({ length: desc.rows }, () =>
            Array.from({ length: desc.cols }, () => "")
          ),
        };
        break;
    }
    const newNodes = [...nodes];
    newNodes.splice(cursor.nodeIdx + 1, 0, newNode);
    setNodes(newNodes);
    // Jump into the first empty slot (skip pre-filled ones so the user
    // lands where they need to type, e.g. □² → power slot already has
    // "2", cursor goes to the base slot).
    let firstEmpty = 0;
    const total = getSlotCount(newNode);
    for (let i = 0; i < total; i++) {
      if (!getSlotValue(newNode, i)) { firstEmpty = i; break; }
    }
    setCursor({ nodeIdx: cursor.nodeIdx + 1, slotIdx: firstEmpty });
    syncToParent(newNodes);
  };
  insertNodeRef.current = insertNode;

  // ── Backspace ──
  const doBackspace = () => {
    if (activeShape) {
      const param = activeShape.params[activeParamIdx];
      const cur = shapeValues[param.symbol] || "";
      if (cur.length > 0) {
        setShapeValues({ ...shapeValues, [param.symbol]: cur.slice(0, -1) });
      } else if (activeParamIdx > 0) {
        setActiveParamIdx(activeParamIdx - 1);
      } else {
        clearShape();
      }
      return;
    }

    const curNode = nodes[cursor.nodeIdx];
    const currentVal = getSlotValue(curNode, cursor.slotIdx);

    if (currentVal.length > 0) {
      // Remove last char from current slot
      const updatedNode = setSlotValue(curNode, cursor.slotIdx, currentVal.slice(0, -1));
      const newNodes = [...nodes];
      newNodes[cursor.nodeIdx] = updatedNode;
      setNodes(newNodes);
      syncToParent(newNodes);
    } else if (curNode.type !== "text") {
      // If all slots empty, remove the template node
      const allEmpty = Array.from({ length: getSlotCount(curNode) }).every(
        (_, i) => getSlotValue(curNode, i) === ""
      );
      if (allEmpty) {
        const newNodes = nodes.filter((_, i) => i !== cursor.nodeIdx);
        if (newNodes.length === 0) newNodes.push({ type: "text", value: "" });
        const newIdx = Math.max(0, cursor.nodeIdx - 1);
        setNodes(newNodes);
        setCursor({ nodeIdx: newIdx, slotIdx: getSlotCount(newNodes[newIdx]) - 1 });
        syncToParent(newNodes);
      } else if (cursor.slotIdx > 0) {
        setCursor({ ...cursor, slotIdx: cursor.slotIdx - 1 });
      }
    } else if (cursor.nodeIdx > 0) {
      // Move to previous node
      const prevNode = nodes[cursor.nodeIdx - 1];
      setCursor({ nodeIdx: cursor.nodeIdx - 1, slotIdx: getSlotCount(prevNode) - 1 });
    }
  };

  // ── Submit ──
  const doSubmit = () => {
    if (activeShape) {
      const allFilled = activeShape.params.every((p) => {
        const v = parseFloat(shapeValues[p.symbol] || "");
        return !isNaN(v) && v > 0;
      });
      if (!allFilled) return;

      const numericValues: Record<string, number> = {};
      activeShape.params.forEach((p) => {
        numericValues[p.symbol] = parseFloat(shapeValues[p.symbol] || "0");
      });

      if (onShapeSubmit) {
        onShapeSubmit({ shape: activeShape, values: numericValues });
      } else {
        const parts = activeShape.params.map((p) => `${p.symbol}=${shapeValues[p.symbol] || "?"}`).join(", ");
        const eq = `${activeShape.name}(${parts})`;
        clearShape();
        setNodes([{ type: "text", value: "" }]);
        setCursor({ nodeIdx: 0, slotIdx: 0 });
        onSubmit?.(eq);
      }
      return;
    }

    const text = nodesToString(nodes);
    if (text.trim()) {
      onSubmit?.(text);
      setNodes([{ type: "text", value: "" }]);
      setCursor({ nodeIdx: 0, slotIdx: 0 });
    }
  };

  // ── Slot click handler ──
  const handleSlotClick = useCallback((nodeIdx: number, slotIdx: number) => {
    setCursor({ nodeIdx, slotIdx });
    focusInput();
  }, [focusInput]);

  // ── Key press handler ──
  const press = (key: K) => {
    const v = key.v;

    // Action keys
    if (v === "__BACKSPACE__") { doBackspace(); focusInput(); return; }
    if (v === "__SUBMIT__") { doSubmit(); focusInput(); return; }
    if (v === "__LEFT__") { moveLeft(); focusInput(); return; }
    if (v === "__RIGHT__") { moveRight(); focusInput(); return; }
    if (key.d === "abc") { focusInput(); return; }

    // Template keys
    if (v === "__FRAC__") { insertTemplate("frac"); focusInput(); return; }
    if (v === "__EXP__") { insertTemplate("exp"); focusInput(); return; }
    if (v === "__SUB__") { insertTemplate("sub"); focusInput(); return; }
    if (v === "__SQRT__") { insertTemplate("sqrt"); focusInput(); return; }
    if (v === "__NTHRT__") { insertTemplate("nthrt"); focusInput(); return; }
    if (v === "__SCI__") { insertTemplate("sci"); focusInput(); return; }
    if (v === "__MIXED__") { insertTemplate("mixed"); focusInput(); return; }
    if (v === "__COORD__") { insertTemplate("coord"); focusInput(); return; }
    if (v === "__MATRIX__") { setShowMatrixModal(true); return; }

    // Shape keys
    if (v.startsWith("__SHAPE_")) {
      const shape = SHAPES[v];
      if (shape) {
        setActiveShape(shape);
        setShapeValues({});
        setActiveParamIdx(0);
        setNodes([{ type: "text", value: "" }]);
        setCursor({ nodeIdx: 0, slotIdx: 0 });
      }
      focusInput();
      return;
    }

    // Regular character
    typeChar(v);
    focusInput();
  };

  // ─── Shape Diagram Renderer ─────────────────────────────────
  const renderShapeDiagram = () => {
    if (!activeShape) return null;
    const vals = shapeValues;
    const params = activeShape.params;

    const paramField = (p: { label: string; symbol: string }, idx: number) => (
      <div key={p.symbol} className="flex items-center gap-1.5">
        <em style={{ fontSize: 18, color: "#333", fontStyle: "italic", fontFamily: "Georgia, serif" }}>{p.symbol}</em>
        <span style={{ fontSize: 18, color: "#999" }}>=</span>
        <span
          onClick={() => { setActiveParamIdx(idx); focusInput(); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minWidth: 32,
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            padding: "2px 6px 4px",
            cursor: "text",
            fontFamily: "Georgia, serif",
            color: idx === activeParamIdx ? "#2c5aa0" : vals[p.symbol] ? "#1a1a2e" : "#c0392b",
            borderBottom: idx === activeParamIdx ? "2px solid #2c5aa0" : vals[p.symbol] ? "1px solid #ccc" : "2px solid #c0392b",
            background: idx === activeParamIdx ? "rgba(44,90,160,0.08)" : "transparent",
            borderRadius: 2,
            transition: "all 0.15s",
          }}
        >
          {vals[p.symbol] || "?"}
          {idx === activeParamIdx && (
            <span className="animate-[blink_1s_step-end_infinite]" style={{ display: "inline-block", width: 2, height: "1.1em", background: "#2c5aa0", marginLeft: 2 }} />
          )}
        </span>
      </div>
    );

    return (
      <div className="flex items-center gap-4 py-2">
        {renderShapeSVG(activeShape.name)}
        <div className="flex flex-col gap-2.5">
          {params.map((p, i) => paramField(p, i))}
        </div>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className={className} style={{ position: "relative" }}>
      {/* ── Editor Bar (Mathway-exact: light, clean, minimal) ── */}
      <div style={{ background: "#f5f6fa", borderBottom: "1px solid #dde1eb", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, minHeight: activeShape ? 120 : 52 }}>
        {activeShape ? (
          <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
            {renderShapeDiagram()}
            {/* Hidden input for physical keyboard in shape mode */}
            <input
              ref={hiddenInputRef}
              type="text"
              autoComplete="off"
              autoFocus
              style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); doSubmit(); }
                else if (e.key === "Backspace") { e.preventDefault(); doBackspace(); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); moveLeft(); }
                else if (e.key === "ArrowRight") { e.preventDefault(); moveRight(); }
                else if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? moveLeft() : moveRight(); }
                else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); typeChar(e.key); }
              }}
            />
          </div>
        ) : hasTemplateNodes ? (
          <div
            className="flex-1 flex items-center cursor-text overflow-x-auto overflow-y-hidden"
            style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 22, scrollbarWidth: "none", minHeight: 44 }}
            onClick={() => focusInput()}
          >
            <span className="whitespace-nowrap flex items-center gap-0.5" style={{ color: "#333" }}>
              {nodes.map((node, i) => renderNode(node, i, cursor, false, handleSlotClick))}
            </span>
            <input
              ref={hiddenInputRef}
              type="text"
              autoComplete="off"
              style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && ["c", "v", "a"].includes(e.key.toLowerCase())) return;
                e.preventDefault();
                if (e.key === "Enter") doSubmit();
                else if (e.key === "Backspace") doBackspace();
                else if (e.key === "ArrowLeft") moveLeft();
                else if (e.key === "ArrowRight") moveRight();
                else if (e.key === "Tab") { e.shiftKey ? moveLeft() : moveRight(); }
                else if (e.key.length === 1) typeChar(e.key);
              }}
            />
          </div>
        ) : (
          <input
            ref={hiddenInputRef}
            type="text"
            value={plainTextValue}
            placeholder="Enter a problem..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent border-none outline-none select-text"
            style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 20, color: "#333", caretColor: "#4a6fa5" }}
            onChange={(e) => {
              const val = e.target.value;
              setNodes([{ type: "text", value: val }]);
              setCursor({ nodeIdx: 0, slotIdx: 0 });
              syncToParent([{ type: "text", value: val }]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                doSubmit();
              }
            }}
          />
        )}

        {/* All Math Inputs trigger — opens the comprehensive purple panel
            with Basic Math / Calculus / Vectors & Matrices / Trigonometry
            / Symbols sections. Sits just before the Send/Camera control on
            the right edge of the input bar. */}
        <button
          type="button"
          aria-label="All math inputs"
          onClick={() => setShowAllMath(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", height: 34, borderRadius: 8,
            background: "linear-gradient(180deg, #4a7eb0 0%, #3a6d9a 100%)",
            color: "#fff", border: "none", cursor: "pointer", flexShrink: 0,
            fontSize: 12, fontWeight: 600, letterSpacing: 0.2,
            boxShadow: "0 1px 2px rgba(44, 90, 160, 0.25)",
          }}
        >
          <span style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 14 }}>fx</span>
          <span className="hidden sm:inline">All Math Inputs</span>
        </button>

        {/* Send / Camera icon */}
        {hasContent ? (
          <button
            onClick={doSubmit}
            style={{ width: 36, height: 36, borderRadius: 8, background: "#6b8fc5", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", flexShrink: 0 }}
          >
            ▶
          </button>
        ) : (
          <button style={{ width: 32, height: 32, background: "transparent", border: "none", cursor: "pointer", color: "#8899b0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="3" width="20" height="18" rx="3" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <rect x="15" y="5" width="4" height="2" rx="0.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Keyboard (Mathway-exact light theme) ── */}
      <div style={{ background: "#bcc4d8", padding: "0 1px 3px", userSelect: "none" }}>
        {/* Section header: f(x) | y | x² */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid #a8b2c8" }}>
          {[
            { label: "f(x)", html: "<em style='font-style:italic;font-family:Georgia,serif'>f</em>(<em style='font-style:italic;font-family:Georgia,serif'>x</em>)" },
            { label: "y", html: "<em style='font-style:italic;font-family:Georgia,serif'>y</em>" },
            { label: "x²", html: "<em style='font-style:italic;font-family:Georgia,serif'>x</em><sup style='font-size:0.65em;vertical-align:super'>2</sup>" },
          ].map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              style={{
                padding: "7px 0",
                fontSize: 14,
                fontFamily: "Georgia, 'Times New Roman', serif",
                background: activeTab === i ? "#d5daea" : "#c5cde0",
                color: activeTab === i ? "#2c3e50" : "#5a6a80",
                fontWeight: activeTab === i ? 600 : 400,
                borderRight: i < 2 ? "1px solid #a8b2c8" : "none",
                borderTop: "none", borderBottom: "none", borderLeft: "none",
                cursor: "pointer",
                textAlign: "center",
              }}
              dangerouslySetInnerHTML={{ __html: tab.html }}
            />
          ))}
        </div>

        {/* Key grid */}
        <div style={{ padding: "2px 2px 1px" }}>
          {keyboard.map((row, ri) => {
            let cols = 0;
            row.forEach((k) => { cols += k.s?.includes("w2") ? 2 : 1; });

            return (
              <div
                key={ri}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gap: "2px",
                  marginBottom: ri < keyboard.length - 1 ? "2px" : 0,
                }}
              >
                {row.map((key, ki) => {
                  const isWide = key.s?.includes("w2");
                  const isSp = key.s?.includes("sp");
                  const isAc = key.s?.includes("ac");

                  let bg: string, color: string, border: string, shadow: string;

                  const isAbc = key.d === "abc";
                  if (isAbc) {
                    bg = "#6b8fc5"; color = "#fff"; border = "#5a7eb3"; shadow = "#4a6e9f";
                  } else if (isAc) {
                    bg = "#7da0ca"; color = "#fff"; border = "#6b8fb8"; shadow = "#5a7ea6";
                  } else if (isSp) {
                    bg = "#e3e8f2"; color = "#3d5a80"; border = "#c5cde0"; shadow = "#b0b8cc";
                  } else {
                    bg = "#eef0f6"; color = "#2c3e50"; border = "#c5cde0"; shadow = "#b0b8cc";
                  }

                  return (
                    <button
                      key={ki}
                      onClick={() => press(key)}
                      tabIndex={-1}
                      style={{
                        gridColumn: isWide ? "span 2" : "span 1",
                        height: 46,
                        background: bg,
                        color: color,
                        border: `1px solid ${border}`,
                        borderRadius: 6,
                        boxShadow: `0 1px 0 ${shadow}`,
                        fontSize: key.d.length > 3 ? 12 : key.d.length > 2 ? 14 : 18,
                        fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
                        fontWeight: 400,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        lineHeight: 1,
                        transition: "background 0.08s, transform 0.05s",
                        WebkitTapHighlightColor: "transparent",
                        overflow: "hidden",
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent stealing focus from hidden input
                        const el = e.currentTarget;
                        el.style.transform = "translateY(1px)";
                        el.style.boxShadow = "none";
                      }}
                      onMouseUp={(e) => {
                        const el = e.currentTarget;
                        el.style.transform = "";
                        el.style.boxShadow = `0 2px 0 ${shadow}`;
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        el.style.transform = "";
                        el.style.boxShadow = `0 2px 0 ${shadow}`;
                      }}
                    >
                      {renderKeyIcon(key.d, color)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Matrix Size Selector Modal ── */}
      {showMatrixModal && !matrixData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowMatrixModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, minWidth: 260, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={() => setShowMatrixModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            {/* Size selectors */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
              <select value={matrixRows} onChange={(e) => setMatrixRows(parseInt(e.target.value))}
                style={{ padding: "6px 12px", border: "2px solid #1a3a6b", borderRadius: 6, fontSize: 16, fontWeight: 600, minWidth: 55, textAlign: "center" }}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#333" }}>×</span>
              <select value={matrixCols} onChange={(e) => setMatrixCols(parseInt(e.target.value))}
                style={{ padding: "6px 12px", border: "2px solid #1a3a6b", borderRadius: 6, fontSize: 16, fontWeight: 600, minWidth: 55, textAlign: "center" }}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {/* Preview grid */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 48, fontWeight: 200, lineHeight: 1, color: "#1a3a6b", fontFamily: "Georgia,serif" }}>[</span>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${matrixCols}, 1fr)`, gap: 4, padding: "4px 8px" }}>
                {Array.from({ length: matrixRows * matrixCols }).map((_, i) => {
                  const r = Math.floor(i / matrixCols);
                  const c = i % matrixCols;
                  const isActive = r < matrixRows && c < matrixCols;
                  return (
                    <div key={i} style={{
                      width: 36, height: 36, borderRadius: 4,
                      background: isActive ? "#1a3a6b" : "#e8ecf4",
                      border: isActive ? "none" : "1px solid #c5cde0",
                    }} />
                  );
                })}
              </div>
              <span style={{ fontSize: 48, fontWeight: 200, lineHeight: 1, color: "#1a3a6b", fontFamily: "Georgia,serif" }}>]</span>
            </div>
            {/* Insert button */}
            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => {
                  const data = Array.from({ length: matrixRows }, () => Array.from({ length: matrixCols }, () => ""));
                  setMatrixData(data);
                  setMatrixActiveCell([0, 0]);
                  setShowMatrixModal(false);
                }}
                style={{ background: "#0F4F3C", color: "#fff", border: "none", borderRadius: 20, padding: "10px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Matrix Editor in Editor Bar ── */}
      {matrixData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}
          onClick={() => {}}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>Fill in the matrix</span>
              <button onClick={() => { setMatrixData(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            {/* Matrix with brackets and editable cells */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 64, fontWeight: 200, lineHeight: 1, color: "#1a3a6b", fontFamily: "Georgia,serif" }}>[</span>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${matrixData[0]?.length || 1}, 1fr)`, gap: 6, padding: "8px 4px" }}>
                {matrixData.map((row, ri) =>
                  row.map((cell, ci) => (
                    <input
                      key={`${ri}-${ci}`}
                      type="text"
                      value={cell}
                      autoFocus={ri === matrixActiveCell[0] && ci === matrixActiveCell[1]}
                      onChange={(e) => {
                        const newData = matrixData.map((r) => [...r]);
                        newData[ri][ci] = e.target.value;
                        setMatrixData(newData);
                      }}
                      onFocus={() => setMatrixActiveCell([ri, ci])}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" || e.key === "ArrowRight") {
                          e.preventDefault();
                          const nextC = ci + 1 < row.length ? ci + 1 : 0;
                          const nextR = ci + 1 < row.length ? ri : ri + 1 < matrixData.length ? ri + 1 : 0;
                          setMatrixActiveCell([nextR, nextC]);
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          const prevC = ci - 1 >= 0 ? ci - 1 : row.length - 1;
                          const prevR = ci - 1 >= 0 ? ri : ri - 1 >= 0 ? ri - 1 : matrixData.length - 1;
                          setMatrixActiveCell([prevR, prevC]);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setMatrixActiveCell([Math.min(ri + 1, matrixData.length - 1), ci]);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setMatrixActiveCell([Math.max(ri - 1, 0), ci]);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          // Move to next cell or submit
                          if (ci + 1 < row.length) setMatrixActiveCell([ri, ci + 1]);
                          else if (ri + 1 < matrixData.length) setMatrixActiveCell([ri + 1, 0]);
                        }
                      }}
                      style={{
                        width: 48, height: 48, textAlign: "center", fontSize: 18, fontWeight: 600,
                        fontFamily: "Georgia, serif", color: "#1a1a2e",
                        border: ri === matrixActiveCell[0] && ci === matrixActiveCell[1] ? "2px solid #2c5aa0" : "2px solid #c5cde0",
                        borderRadius: 6, outline: "none",
                        background: ri === matrixActiveCell[0] && ci === matrixActiveCell[1] ? "#eef2ff" : cell ? "#f0f4ff" : "#f8f9fc",
                      }}
                      placeholder="?"
                    />
                  ))
                )}
              </div>
              <span style={{ fontSize: 64, fontWeight: 200, lineHeight: 1, color: "#1a3a6b", fontFamily: "Georgia,serif" }}>]</span>
            </div>
            {/* Submit matrix */}
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={() => {
                  // Build matrix string for the solver: [[a,b],[c,d]]
                  const matStr = "[" + matrixData.map(row => "[" + row.map(c => c || "0").join(",") + "]").join(",") + "]";
                  // Also build a display-friendly version
                  const displayStr = matrixData.map(row => row.map(c => c || "0").join(" ")).join("; ");
                  setMatrixData(null);
                  // Insert into the text input
                  const newNodes: ExprNode[] = [{ type: "text", value: `matrix(${displayStr})` }];
                  setNodes(newNodes);
                  setCursor({ nodeIdx: 0, slotIdx: 0 });
                  syncToParent(newNodes);
                  onSubmit?.(`matrix ${matStr}`);
                }}
                style={{ background: "#0F4F3C", color: "#fff", border: "none", borderRadius: 20, padding: "10px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                Solve Matrix
              </button>
              <button
                onClick={() => { setMatrixData(null); }}
                style={{ background: "#e8ecf4", color: "#555", border: "none", borderRadius: 20, padding: "10px 24px", fontSize: 14, cursor: "pointer", marginLeft: 8 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Math Inputs panel — docks directly below the editor bar
          (top border flush with the input box's bottom border) and does
          NOT block typing in the input. */}
      {showAllMath && (
        <AllMathInputsPanel
          editorBarHeight={activeShape ? 120 : 52}
          onClose={() => setShowAllMath(false)}
          onInsertText={(text) => insertText(text)}
          onInsertNode={(desc) => insertNode(desc)}
        />
      )}

      {/* Blink cursor keyframe */}
      <style jsx global>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   All Math Inputs panel — comprehensive template-insertion keyboard
   styled after Mathway's "All Math Inputs" overlay. 5 collapsible
   sections (Basic Math, Calculus & Sums, Vectors & Matrices,
   Trigonometry, Symbols). Each button inserts a plain-text template
   into the parent MathInput via the supplied onInsert callback. □
   placeholders are inserted verbatim and the user replaces them.
   ──────────────────────────────────────────────────────────────────── */

// Each panel button either inserts a structured math node (proper
// fraction/integral/matrix/etc.) or a plain text fragment (Greek
// letters, comparison operators, etc.). When `node` is set the editor
// renders the template with real math typography and yellow placeholder
// slots; otherwise the text is typed verbatim into the active slot.
interface MathBtnDef {
  label: string;
  tooltip: string;
  node?: MathNodeDescriptor;
  text?: string;
}

interface MathSectionDef {
  title: string;
  buttons: MathBtnDef[];
}

const SECTIONS: MathSectionDef[] = [
  {
    title: "BASIC MATH",
    buttons: [
      { label: "□/□", tooltip: "Fraction", node: { kind: "frac" } },
      { label: "□²", tooltip: "Square", node: { kind: "exp", power: "2" } },
      { label: "□ⁿ", tooltip: "Power", node: { kind: "exp" } },
      { label: "√□", tooltip: "Square root", node: { kind: "sqrt" } },
      { label: "ⁿ√□", tooltip: "Nth root", node: { kind: "nthrt" } },
      { label: "∛□", tooltip: "Cube root", node: { kind: "nthrt", n: "3" } },
      { label: "∞", tooltip: "Infinity", text: "∞" },
      { label: "-∞", tooltip: "Negative infinity", text: "-∞" },
      { label: "π", tooltip: "Pi", text: "π" },
      { label: "e", tooltip: "Euler's number", text: "e" },
      { label: "eˣ", tooltip: "Exponential", node: { kind: "exp" } },
      { label: "ln(□)", tooltip: "Natural logarithm", node: { kind: "func", name: "ln" } },
      { label: "log_□(□)", tooltip: "Logarithm with base", node: { kind: "func", name: "log" } },
      { label: "log₁₀(□)", tooltip: "Common logarithm", node: { kind: "func", name: "log₁₀" } },
      { label: "|□|", tooltip: "Absolute value", node: { kind: "abs" } },
      { label: "□≤□", tooltip: "Less than or equal", text: " ≤ " },
      { label: "□≥□", tooltip: "Greater than or equal", text: " ≥ " },
      { label: "□≠□", tooltip: "Not equal", text: " ≠ " },
    ],
  },
  {
    title: "CALCULUS & SUMS",
    buttons: [
      { label: "d/d□", tooltip: "Derivative", node: { kind: "frac", num: "d", den: "d" } },
      { label: "d²/d□²", tooltip: "Second derivative", node: { kind: "frac", num: "d²", den: "d²" } },
      { label: "∂/∂□", tooltip: "Partial derivative", node: { kind: "frac", num: "∂", den: "∂" } },
      { label: "∂²/∂□²", tooltip: "Second partial derivative", node: { kind: "frac", num: "∂²", den: "∂²" } },
      { label: "∂²/∂□∂□", tooltip: "Mixed partial derivative", node: { kind: "frac", num: "∂²", den: "∂∂" } },
      { label: "∫□", tooltip: "Indefinite integral", node: { kind: "integral", sym: "∫" } },
      { label: "∫∫□□", tooltip: "Double integral", node: { kind: "integral", sym: "∫∫", nDvars: 2 } },
      { label: "∫∫∫□□□", tooltip: "Triple integral", node: { kind: "integral", sym: "∫∫∫", nDvars: 3 } },
      { label: "∫_□^□", tooltip: "Definite integral", node: { kind: "integral", sym: "∫" } },
      { label: "∮", tooltip: "Contour integral", node: { kind: "integral", sym: "∮" } },
      { label: "∮_□", tooltip: "Line integral with domain", node: { kind: "integral", sym: "∮" } },
      { label: "∑", tooltip: "Summation", node: { kind: "bigop", sym: "Σ" } },
      { label: "∏", tooltip: "Product", node: { kind: "bigop", sym: "∏" } },
      { label: "lim", tooltip: "Limit", node: { kind: "lim" } },
      { label: "lim⁺", tooltip: "Right-hand limit", node: { kind: "lim", side: "right" } },
      { label: "lim⁻", tooltip: "Left-hand limit", node: { kind: "lim", side: "left" } },
      { label: "lim_∞", tooltip: "Limit to infinity", node: { kind: "lim", toInfinity: true } },
      { label: "θ(□)", tooltip: "Theta function", node: { kind: "func", name: "θ" } },
      { label: "δ(□)", tooltip: "Dirac delta function", node: { kind: "func", name: "δ" } },
      { label: "ℒ{□}", tooltip: "Laplace transform", node: { kind: "func", name: "ℒ" } },
      { label: "ℒ⁻¹{□}", tooltip: "Inverse Laplace transform", node: { kind: "func", name: "ℒ⁻¹" } },
      { label: "ℱ{□}", tooltip: "Fourier transform", node: { kind: "func", name: "ℱ" } },
      { label: "ℱ⁻¹{□}", tooltip: "Inverse Fourier transform", node: { kind: "func", name: "ℱ⁻¹" } },
    ],
  },
  {
    title: "VECTORS & MATRICES",
    buttons: [
      { label: "[□,□]", tooltip: "2-element row vector", node: { kind: "matrix", rows: 1, cols: 2 } },
      { label: "[□,□,□]", tooltip: "3-element row vector", node: { kind: "matrix", rows: 1, cols: 3 } },
      { label: "[□,□,□,□]", tooltip: "4-element row vector", node: { kind: "matrix", rows: 1, cols: 4 } },
      { label: "col 2×1", tooltip: "2×1 column vector", node: { kind: "matrix", rows: 2, cols: 1 } },
      { label: "col 3×1", tooltip: "3×1 column vector", node: { kind: "matrix", rows: 3, cols: 1 } },
      { label: "col 4×1", tooltip: "4×1 column vector", node: { kind: "matrix", rows: 4, cols: 1 } },
      { label: "2×2", tooltip: "2×2 matrix", node: { kind: "matrix", rows: 2, cols: 2 } },
      { label: "3×3", tooltip: "3×3 matrix", node: { kind: "matrix", rows: 3, cols: 3 } },
      { label: "4×4", tooltip: "4×4 matrix", node: { kind: "matrix", rows: 4, cols: 4 } },
      { label: "5×5", tooltip: "5×5 matrix", node: { kind: "matrix", rows: 5, cols: 5 } },
      { label: "6×6", tooltip: "6×6 matrix", node: { kind: "matrix", rows: 6, cols: 6 } },
    ],
  },
  {
    title: "TRIGONOMETRY",
    buttons: [
      { label: "π", tooltip: "Pi", text: "π" },
      { label: "°", tooltip: "Degree", text: "°" },
      { label: "rad", tooltip: "Radian", text: " rad" },
      { label: "sin□", tooltip: "Sine", node: { kind: "func", name: "sin" } },
      { label: "cos□", tooltip: "Cosine", node: { kind: "func", name: "cos" } },
      { label: "tan□", tooltip: "Tangent", node: { kind: "func", name: "tan" } },
      { label: "sec□", tooltip: "Secant", node: { kind: "func", name: "sec" } },
      { label: "csc□", tooltip: "Cosecant", node: { kind: "func", name: "csc" } },
      { label: "cot□", tooltip: "Cotangent", node: { kind: "func", name: "cot" } },
      { label: "sin⁻¹□", tooltip: "Inverse sine", node: { kind: "func", name: "sin⁻¹" } },
      { label: "cos⁻¹□", tooltip: "Inverse cosine", node: { kind: "func", name: "cos⁻¹" } },
      { label: "tan⁻¹□", tooltip: "Inverse tangent", node: { kind: "func", name: "tan⁻¹" } },
      { label: "sinh□", tooltip: "Hyperbolic sine", node: { kind: "func", name: "sinh" } },
      { label: "cosh□", tooltip: "Hyperbolic cosine", node: { kind: "func", name: "cosh" } },
      { label: "tanh□", tooltip: "Hyperbolic tangent", node: { kind: "func", name: "tanh" } },
      { label: "sech□", tooltip: "Hyperbolic secant", node: { kind: "func", name: "sech" } },
      { label: "csch□", tooltip: "Hyperbolic cosecant", node: { kind: "func", name: "csch" } },
      { label: "coth□", tooltip: "Hyperbolic cotangent", node: { kind: "func", name: "coth" } },
      { label: "sinh⁻¹□", tooltip: "Inverse hyperbolic sine", node: { kind: "func", name: "sinh⁻¹" } },
      { label: "cosh⁻¹□", tooltip: "Inverse hyperbolic cosine", node: { kind: "func", name: "cosh⁻¹" } },
      { label: "tanh⁻¹□", tooltip: "Inverse hyperbolic tangent", node: { kind: "func", name: "tanh⁻¹" } },
      { label: "sech⁻¹□", tooltip: "Inverse hyperbolic secant", node: { kind: "func", name: "sech⁻¹" } },
      { label: "csch⁻¹□", tooltip: "Inverse hyperbolic cosecant", node: { kind: "func", name: "csch⁻¹" } },
      { label: "coth⁻¹□", tooltip: "Inverse hyperbolic cotangent", node: { kind: "func", name: "coth⁻¹" } },
    ],
  },
  {
    title: "SYMBOLS",
    buttons: [
      "Π,°,∞,∀,∃,∪,∩,∇,Δ,α,β,γ,δ,ε,ζ,η,θ,κ,λ,μ,ν,ξ,ρ,σ,τ,φ,χ,ψ,ω,Γ,Θ,Λ,Ξ,Υ,Φ,Ψ,Ω,ℵ,ℏ,÷,→,⊕,⊙,≠,≥,≤"
        .split(",").map((c) => ({ label: c, tooltip: c, text: c })),
    ].flat(),
  },
];

// Blue palette anchored on the gradient already used by the input bar's
// "fx · All Math Inputs" trigger pill and the rest of the dashboard's
// primary actions (#4a7eb0 → #3a6d9a).
const BLUE_BG = "#3a6d9a";          // panel surface
const BTN_BG = "#5a8dc1";           // button rest
const BTN_HOVER = "#6da0d0";        // button hover
const BTN_ACTIVE = "#2c5aa0";       // button pressed
const BORDER = "rgba(255,255,255,0.08)";

interface InsertCallbacks {
  onInsertText: (text: string) => void;
  onInsertNode: (desc: MathNodeDescriptor) => void;
}

function AllMathInputsPanel({
  editorBarHeight,
  onClose,
  onInsertText,
  onInsertNode,
}: { editorBarHeight: number; onClose: () => void } & InsertCallbacks) {
  // Default to the first section (Basic Math). The dropdown lets the
  // user swap to any other section; the previous version showed all
  // sections stacked vertically — too tall and too noisy for a quick
  // template pick.
  const [activeIdx, setActiveIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Re-mount key so the active grid replays its fade-in transition when
  // the section changes. Bumping a counter is simpler than wiring up
  // framer-motion just for one keyframe.
  const [animKey, setAnimKey] = useState(0);

  const pickSection = (idx: number) => {
    setActiveIdx(idx);
    setMenuOpen(false);
    setAnimKey((k) => k + 1);
  };

  // Close on Escape — both the dropdown and the panel itself, in that
  // order so a stray click on the trigger doesn't blow the modal away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, onClose]);

  const active = SECTIONS[activeIdx];

  return (
    // Docked popover: anchored at the bottom of the editor bar (top
    // border flush with the input box's bottom border), absolutely
    // positioned over the keyboard below. No full-screen backdrop and
    // no blur — the user can keep typing in the input box while this
    // panel is open. Width-constrained and centered horizontally so it
    // hovers neatly under the input rather than spanning the whole bar.
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (menuOpen) setMenuOpen(false);
      }}
      style={{
        position: "absolute",
        top: editorBarHeight,
        left: "50%", transform: "translateX(-50%)",
        zIndex: 50,
        width: "min(720px, calc(100% - 16px))",
        maxHeight: "min(70vh, 480px)",
        background: BLUE_BG,
        color: "#fff",
        borderRadius: 12,
        boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        display: "flex", flexDirection: "column",
        animation: "amiPanelIn 0.18s ease-out",
      }}
    >
      <div
        style={{
          display: "flex", flexDirection: "column",
          width: "100%", height: "100%",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.12)",
        }}>
          <h2 style={{
            margin: 0, fontSize: 13, fontWeight: 700,
            letterSpacing: 1.2, textTransform: "uppercase",
          }}>All Math Inputs</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", color: "rgba(255,255,255,0.85)",
              border: "none", cursor: "pointer",
              fontSize: 20, lineHeight: 1, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>

        {/* Section picker — dropdown trigger + menu */}
        <div
          style={{ position: "relative", padding: "14px 20px 0" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "10px 14px",
              borderRadius: 10, border: `1px solid ${BORDER}`,
              background: BTN_BG, color: "#fff", cursor: "pointer",
              fontSize: 13, fontWeight: 700, letterSpacing: 1.1,
              textTransform: "uppercase",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BTN_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BTN_BG; }}
          >
            <span>{active.title}</span>
            <span style={{ fontSize: 11, opacity: 0.85, transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s ease" }}>▾</span>
          </button>
          {menuOpen && (
            <ul
              role="listbox"
              style={{
                position: "absolute", left: 20, right: 20, top: "100%",
                marginTop: 6, zIndex: 1, listStyle: "none",
                padding: 6, borderRadius: 10,
                background: "#2c5aa0",
                border: `1px solid ${BORDER}`,
                boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
                animation: "amiDropdownIn 0.16s ease-out",
              }}
            >
              {SECTIONS.map((s, i) => (
                <li key={s.title}>
                  <button
                    role="option"
                    aria-selected={i === activeIdx}
                    onClick={() => pickSection(i)}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "9px 12px", borderRadius: 6,
                      background: i === activeIdx ? "rgba(255,255,255,0.14)" : "transparent",
                      color: "#fff", border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, letterSpacing: 1.1,
                      textTransform: "uppercase",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.18)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = i === activeIdx ? "rgba(255,255,255,0.14)" : "transparent"; }}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active section's keyboard */}
        <div style={{ padding: "16px 20px 20px", overflowY: "auto" }}>
          <div
            key={animKey}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))",
              gap: 8,
              animation: "amiSectionIn 0.22s ease-out",
            }}
          >
            {active.buttons.map((b, i) => (
              <MathBtn
                key={`${active.title}-${i}`}
                def={b}
                onInsertText={onInsertText}
                onInsertNode={onInsertNode}
              />
            ))}
          </div>
        </div>

        {/* Local keyframes for the panel + dropdown + section transitions. */}
        <style jsx global>{`
          @keyframes amiPanelIn {
            from { opacity: 0; transform: translate(-50%, -6px); }
            to   { opacity: 1; transform: translate(-50%, 0); }
          }
          @keyframes amiDropdownIn {
            from { opacity: 0; transform: translateY(-4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes amiSectionIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

function MathBtn({
  def,
  onInsertText,
  onInsertNode,
}: { def: MathBtnDef } & InsertCallbacks) {
  const [pressed, setPressed] = useState(false);
  const handleClick = () => {
    if (def.node) onInsertNode(def.node);
    else if (def.text !== undefined) onInsertText(def.text);
  };
  return (
    <button
      title={def.tooltip}
      aria-label={def.tooltip}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={handleClick}
      style={{
        height: 44,
        padding: "0 6px",
        borderRadius: 8,
        background: pressed ? BTN_ACTIVE : BTN_BG,
        color: "#fff",
        border: `1px solid ${BORDER}`,
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "'Times New Roman', Georgia, serif",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s, transform 0.08s",
        transform: pressed ? "scale(0.96)" : "scale(1)",
        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = pressed ? BTN_ACTIVE : BTN_HOVER; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = pressed ? BTN_ACTIVE : BTN_BG; }}
    >
      {def.label}
    </button>
  );
}
