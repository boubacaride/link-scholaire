"use client";

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useMemo } from "react";
import katex from "katex";

// ─── Types ────────────────────────────────────────────────────
interface TermNode {
  id: string;
  text: string;
  latex: string;
  side: "lhs" | "rhs" | "eq";
  kind: "number" | "variable" | "operator" | "function" | "bracket" | "equals" | "space" | "compound";
  index: number;
}

type AnimPhase = "idle" | "highlight" | "detach" | "moving" | "landing" | "morphing" | "fading" | "result";

interface TermAnimation {
  termId: string;
  phase: AnimPhase;
  fromSide?: "lhs" | "rhs";
  toSide?: "lhs" | "rhs";
  signChange?: { from: string; to: string };
}

// Which terms to animate — matched by text content and position
interface AnimatedTermSpec {
  text: string;        // the text of the term to animate (e.g. "3x", "+", "5")
  side?: "lhs" | "rhs"; // which side it's on
  index?: number;      // position in the token list (disambiguates duplicates)
}

interface AnimatedEquationProps {
  equation: string;
  /** Only these specific terms will animate. Everything else stays idle. */
  animatedTerms?: AnimatedTermSpec[];
  /** Which terms are being REMOVED/CANCELLED (fade out) */
  fadingTerms?: AnimatedTermSpec[];
  /** Which terms are NEW (appear with result glow) */
  resultTerms?: AnimatedTermSpec[];
  phase: AnimPhase;
  colorIntensity?: "vivid" | "standard" | "subtle";
  speed?: number;
  className?: string;
}

// ─── Colors ───────────────────────────────────────────────────
const COLORS = {
  vivid: {
    default: "#e2e8f0",
    highlight: "#ef4444",
    moving: "#3b82f6",
    result: "#10b981",
    simplified: "#3b82f6",
    cancelled: "#6b7280",
    morphing: "#f59e0b",
  },
  standard: {
    default: "#cbd5e1",
    highlight: "#dc2626",
    moving: "#2563eb",
    result: "#059669",
    simplified: "#2563eb",
    cancelled: "#9ca3af",
    morphing: "#d97706",
  },
  subtle: {
    default: "#94a3b8",
    highlight: "#b91c1c",
    moving: "#1d4ed8",
    result: "#047857",
    simplified: "#1d4ed8",
    cancelled: "#6b7280",
    morphing: "#92400e",
  },
};

// ─── Tokenize equation into individually addressable terms ────
function tokenizeEquation(eq: string): TermNode[] {
  const tokens: TermNode[] = [];
  const str = eq.trim();
  if (!str) return tokens;

  // Split on = to determine sides
  const eqParts = str.split(/(?<!=)(=)(?!=)/);
  let currentSide: "lhs" | "rhs" | "eq" = "lhs";
  let globalIdx = 0;

  for (const part of eqParts) {
    if (part === "=") {
      tokens.push({
        id: `eq_${globalIdx}`,
        text: "=",
        latex: "=",
        side: "eq",
        kind: "equals",
        index: globalIdx,
      });
      globalIdx++;
      currentSide = "rhs";
      continue;
    }

    // Tokenize each side — group coefficients with variables (e.g. "3x" stays together)
    const tokenPattern = /\\?[a-zA-Z]+\([^)]*\)|\d+\.?\d*[a-zA-Z]+(?:\^\d+)?|\d+\.?\d*|\\?[a-zA-Z]+(?:\^[{\d}]+)?|[+\-−×·÷*/^]|[(){}[\]]|./g;
    const sideStr = part.trim();
    const pieces = sideStr.match(tokenPattern);

    if (pieces) {
      for (const piece of pieces) {
        const trimmed = piece.trim();
        if (!trimmed) continue;

        let kind: TermNode["kind"] = "compound";
        if (/^[+\-−×·÷*/]$/.test(trimmed)) kind = "operator";
        else if (/^[()[\]{}]$/.test(trimmed)) kind = "bracket";
        else if (/^\d+\.?\d*$/.test(trimmed)) kind = "number";
        else if (/^[a-zA-Z]$/.test(trimmed)) kind = "variable";
        else if (/^[a-zA-Z]+\(/.test(trimmed)) kind = "function";

        tokens.push({
          id: `t_${currentSide}_${globalIdx}_${trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6)}`,
          text: trimmed,
          latex: trimmed,
          side: currentSide,
          kind,
          index: globalIdx,
        });
        globalIdx++;
      }
    }
  }

  return tokens;
}

// ─── Check if a token matches an AnimatedTermSpec ─────────────
function termMatches(token: TermNode, spec: AnimatedTermSpec): boolean {
  // Normalize comparison (handle − vs -)
  const normalizeText = (t: string) => t.replace(/−/g, "-").trim();
  const tokenText = normalizeText(token.text);
  const specText = normalizeText(spec.text);

  if (tokenText !== specText) return false;
  if (spec.side && token.side !== spec.side) return false;
  if (spec.index !== undefined && token.index !== spec.index) return false;
  return true;
}

// ─── Render a single KaTeX term ───────────────────────────────
function renderTermKatex(latex: string): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      trust: true,
      strict: false,
    });
  } catch {
    return latex;
  }
}

// ─── Phase animation variants ─────────────────────────────────
function getPhaseVariants(phase: AnimPhase, colors: typeof COLORS.standard, speed: number) {
  const dur = (ms: number) => ms / 1000 / speed;

  switch (phase) {
    case "highlight":
      return {
        animate: {
          color: colors.highlight,
          scale: [1, 1.15, 1.08, 1.15, 1.08],
          textShadow: [
            `0 0 0px ${colors.highlight}`,
            `0 0 24px ${colors.highlight}`,
            `0 0 10px ${colors.highlight}`,
            `0 0 24px ${colors.highlight}`,
            `0 0 14px ${colors.highlight}`,
          ],
        },
        transition: { duration: dur(2000) },
      };
    case "detach":
      return {
        animate: {
          y: -12,
          scale: 1.15,
          opacity: 0.9,
          color: colors.highlight,
          textShadow: `0 6px 16px rgba(0,0,0,0.4)`,
        },
        transition: { duration: dur(1200) },
      };
    case "moving":
      return {
        animate: {
          x: [0, -40, -20, 30, 50, 30, 0],
          y: [0, -14, -30, -35, -22, -10, 0],
          scale: [1.12, 1.18, 1.2, 1.18, 1.12, 1.06, 1],
          color: [colors.highlight, colors.highlight, colors.morphing, colors.morphing, colors.result, colors.result],
          textShadow: [
            `0 0 14px ${colors.highlight}`,
            `0 0 24px ${colors.highlight}`,
            `0 0 28px ${colors.morphing}`,
            `0 0 24px ${colors.morphing}`,
            `0 0 18px ${colors.result}`,
            `0 0 12px ${colors.result}`,
          ],
        },
        transition: { duration: dur(3000) },
      };
    case "landing":
      return {
        animate: {
          y: [0, -10, 4, -3, 1, 0],
          scale: [1.1, 1, 1.05, 1, 1.02, 1],
          color: colors.result,
          textShadow: `0 0 10px ${colors.result}`,
        },
        transition: { duration: dur(1500) },
      };
    case "morphing":
      return {
        animate: {
          scale: [1, 0.8, 1.2, 1],
          opacity: [1, 0.4, 1],
          color: colors.morphing,
        },
        transition: { duration: dur(1000) },
      };
    case "fading":
      return {
        animate: {
          opacity: [1, 0.5, 0.2, 0],
          scale: [1, 0.85, 0.7],
          color: colors.cancelled,
          textDecoration: "line-through",
        },
        transition: { duration: dur(1200) },
      };
    case "result":
      return {
        animate: {
          color: colors.result,
          scale: [1, 1.1, 1.04, 1.08, 1],
          textShadow: [
            `0 0 0px ${colors.result}`,
            `0 0 24px ${colors.result}`,
            `0 0 12px ${colors.result}`,
            `0 0 18px ${colors.result}`,
            `0 0 8px ${colors.result}`,
          ],
        },
        transition: { duration: dur(1500) },
      };
    default: // idle
      return {
        animate: { color: colors.default, scale: 1, y: 0, x: 0, opacity: 1, textShadow: "none" },
        transition: { duration: dur(400) },
      };
  }
}

// ─── Main Component ───────────────────────────────────────────
export default function AnimatedEquation({
  equation,
  animatedTerms = [],
  fadingTerms = [],
  resultTerms = [],
  phase = "idle",
  colorIntensity = "standard",
  speed = 1.0,
  className = "",
}: AnimatedEquationProps) {
  const colors = COLORS[colorIntensity];
  const tokens = useMemo(() => tokenizeEquation(equation), [equation]);

  // Determine each token's individual phase
  const getTokenPhase = (token: TermNode): AnimPhase => {
    // Check if this token is in the fading list
    for (const spec of fadingTerms) {
      if (termMatches(token, spec)) return "fading";
    }
    // Check if this token is in the result list (new terms)
    for (const spec of resultTerms) {
      if (termMatches(token, spec)) return "result";
    }
    // Check if this token is in the animated list (terms being operated on)
    for (const spec of animatedTerms) {
      if (termMatches(token, spec)) return phase; // use the current phase
    }
    // If no specific terms are specified, apply phase to ALL (backward compat)
    if (animatedTerms.length === 0 && fadingTerms.length === 0 && resultTerms.length === 0) {
      return phase;
    }
    // This token is not affected — stays idle
    return "idle";
  };

  return (
    <LayoutGroup id="animated-eq">
      <div className={`flex items-center justify-center flex-wrap gap-1 ${className}`}>
        <AnimatePresence mode="popLayout">
          {tokens.map((token) => {
            const tokenPhase = getTokenPhase(token);
            const variants = getPhaseVariants(tokenPhase, colors, speed);

            return (
              <motion.span
                key={token.id}
                layoutId={token.id}
                layout
                initial={{ opacity: 1, scale: 1 }}
                animate={variants.animate}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={variants.transition}
                className="inline-block select-text"
                style={{
                  fontFamily: "'KaTeX_Main', 'Times New Roman', serif",
                  fontSize: token.kind === "equals" ? "1.2em" : token.kind === "operator" ? "1.1em" : "1em",
                  fontWeight: token.kind === "equals" ? 400 : undefined,
                  padding: token.kind === "operator" || token.kind === "equals" ? "0 4px" : "0 1px",
                  cursor: "default",
                  willChange: "transform, opacity, color",
                }}
                dangerouslySetInnerHTML={{
                  __html: renderTermKatex(token.latex),
                }}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

// ─── Export tokenizer for use by the orchestrator ──────────────
export { tokenizeEquation, termMatches, type TermNode, type TermAnimation, type AnimPhase, type AnimatedTermSpec };
