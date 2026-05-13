// Core types for the token-level math animation engine

export type MathTokenKind =
  | "variable" | "coefficient" | "constant"
  | "operator" | "equals" | "inequality"
  | "fraction-bar" | "exponent" | "radical" | "log"
  | "open-paren" | "close-paren"
  | "integral" | "derivative" | "summation" | "limit"
  | "trig-fn" | "function-name"
  | "text" | "space";

export type HighlightState =
  | "active"      // being operated on (red/orange pulse)
  | "moving"      // flying across equals sign
  | "result"      // just computed (green glow)
  | "simplified"  // collapsed into (blue)
  | "cancelled"   // being removed (fade out)
  | "dim"         // de-emphasized
  | null;

export interface MathToken {
  id: string;
  kind: MathTokenKind;
  latex: string;
  text: string;           // plain text for display fallback
  highlight: HighlightState;
  side: "lhs" | "rhs" | "expr";
}

export interface EquationState {
  tokens: MathToken[];
  latex: string;
  hasEquals: boolean;
}

export interface AnimationStep {
  stepNumber: number;
  description: string;
  beforeState: EquationState;
  afterState: EquationState;
  highlightTokenIds: string[];
  highlightType: HighlightState;
  durationMs: number;
}

export interface AnimationTimeline {
  steps: AnimationStep[];
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
}

// Timing constants (base ms at 1x speed) — deliberately slow for readability
export const BASE_DURATIONS = {
  highlight: 1500,
  move: 2500,
  simplify: 2000,
  collapse: 1800,
  divide: 2500,
  pause: 1500,
  stepTransition: 1200,
};
