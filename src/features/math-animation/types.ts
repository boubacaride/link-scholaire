import type { SolutionStep, TermMovement } from "@/lib/equationSolver";

export type { SolutionStep, TermMovement };

export interface MathToken {
  id: string;
  text: string;
  isOperator: boolean;
  side: "left" | "right" | "equals";
  index: number;
}

export interface LayoutToken extends MathToken {
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export type AnimationPhase =
  | "entering"
  | "stationary"
  | "moving"
  | "exiting"
  | "morphing";

export interface TokenAnimationPlan {
  tokenId: string;
  phase: AnimationPhase;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startText: string;
  endText: string;
  animationType: string;
  color: string;
  duration: number;
}
