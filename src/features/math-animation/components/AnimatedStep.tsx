"use client";

import { tokenizeEquation } from "../tokenizer";
import { layoutTokens } from "../layoutEngine";
import AnimatedToken from "./AnimatedToken";
import StepConnector from "./StepConnector";
import type { SolutionStep, LayoutToken, MathToken } from "../types";

interface AnimatedStepProps {
  step: SolutionStep;
  prevStep?: SolutionStep;
  y: number;
  centerX: number;
  maxWidth: number;
  progress: number;
  isComplete: boolean;
  isActive: boolean;
  baseFontSize: number;
}

/**
 * Match a term movement to a token by comparing text content.
 * Returns the index of the matching token, or -1 if not found.
 */
function findTokenByText(
  tokens: LayoutToken[],
  term: string
): number {
  const needle = term.trim().toLowerCase();

  // Exact match first
  const exactIdx = tokens.findIndex(
    (t) => t.text.trim().toLowerCase() === needle
  );
  if (exactIdx !== -1) return exactIdx;

  // Partial match: token text contained within term or vice versa
  const partialIdx = tokens.findIndex((t) => {
    const tokenText = t.text.trim().toLowerCase();
    return tokenText.includes(needle) || needle.includes(tokenText);
  });
  return partialIdx;
}

/**
 * Build layout tokens for an equation string.
 */
function buildLayout(
  equation: string,
  centerX: number,
  baseY: number,
  fontSize: number,
  maxWidth: number
): LayoutToken[] {
  const tokens = tokenizeEquation(equation);
  return layoutTokens(tokens, centerX, baseY, fontSize, maxWidth);
}

// Step description colors by operation type
const OPERATION_COLORS: Record<string, string> = {
  subtract: "#ff6b6b",
  add: "#51cf66",
  multiply: "#ffd43b",
  divide: "#74c0fc",
  simplify: "#b197fc",
  combine: "#b197fc",
  isolate: "#ff922b",
  factor: "#20c997",
  default: "rgba(255, 255, 255, 0.6)",
};

function getOperationColor(operation: string): string {
  const key = operation.toLowerCase();
  for (const [op, color] of Object.entries(OPERATION_COLORS)) {
    if (key.includes(op)) return color;
  }
  return OPERATION_COLORS.default;
}

// Token colors
const DEFAULT_COLOR = "rgba(255, 255, 255, 0.9)";
const FINAL_GLOW_COLOR = "#4dabf7";

export default function AnimatedStep({
  step,
  prevStep,
  y,
  centerX,
  maxWidth,
  progress,
  isComplete,
  isActive,
  baseFontSize,
}: AnimatedStepProps) {
  const DESCRIPTION_OFFSET_Y = -30;
  const CONNECTOR_HEIGHT = 35;

  // Layout the "after" equation (the result of this step)
  const afterLayout = buildLayout(
    step.afterEquation,
    centerX,
    y,
    baseFontSize,
    maxWidth
  );

  // Layout the "before" equation if we have a previous step to animate from
  const beforeLayout = prevStep
    ? buildLayout(prevStep.afterEquation, centerX, y - 100, baseFontSize, maxWidth)
    : null;

  // Determine if this is the final step (for glow effect)
  const isFinalStep =
    step.description.toLowerCase().includes("solution") ||
    step.description.toLowerCase().includes("answer") ||
    step.operation.toLowerCase().includes("final");

  // Build animation plans for each after-token
  const tokenPlans = afterLayout.map((afterToken, idx) => {
    let animateFrom: { x: number; y: number } | undefined;
    let animationType = "fade";
    let color = DEFAULT_COLOR;
    let delay = idx * 0.05;

    if (isActive && beforeLayout && step.termMovements.length > 0) {
      // Try to find a matching movement for this token
      const movement = step.termMovements.find((m) => {
        const resultText = m.resultingTerm.trim().toLowerCase();
        const tokenText = afterToken.text.trim().toLowerCase();
        return resultText === tokenText || resultText.includes(tokenText) || tokenText.includes(resultText);
      });

      if (movement) {
        // Find the source token in the before layout
        const beforeIdx = findTokenByText(beforeLayout, movement.term);
        if (beforeIdx !== -1) {
          const beforeToken = beforeLayout[beforeIdx];
          animateFrom = { x: beforeToken.x, y: beforeToken.y };
        }
        animationType = movement.animationType;
        color = movement.color || DEFAULT_COLOR;
        delay = 0;
      } else {
        // Token has no explicit movement -- try to find a positional match from before
        if (idx < beforeLayout.length) {
          const beforeToken = beforeLayout[idx];
          if (beforeToken.text.trim().toLowerCase() === afterToken.text.trim().toLowerCase()) {
            animateFrom = { x: beforeToken.x, y: beforeToken.y };
            animationType = "slide_down";
          }
        }
      }
    }

    // Override color for final step glow
    if (isFinalStep && isComplete) {
      color = FINAL_GLOW_COLOR;
    }

    return {
      token: afterToken,
      animateFrom,
      animationType,
      color,
      delay,
    };
  });

  const opColor = getOperationColor(step.operation);

  return (
    <g>
      {/* Step description text */}
      <text
        x={centerX}
        y={y + DESCRIPTION_OFFSET_Y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={baseFontSize * 0.55}
        fill={opColor}
        fontFamily="'Inter', 'Segoe UI', sans-serif"
        fontWeight={600}
        letterSpacing="0.03em"
        opacity={isComplete || isActive ? 0.85 : 0}
      >
        {step.description}
      </text>

      {/* Animated tokens */}
      {tokenPlans.map((plan) => (
        <AnimatedToken
          key={plan.token.id}
          text={plan.token.text}
          x={plan.token.x}
          y={plan.token.y}
          fontSize={plan.token.fontSize}
          color={plan.color}
          opacity={isComplete || isActive ? 1 : 0}
          animateFrom={isActive ? plan.animateFrom : undefined}
          progress={isActive ? progress : 1}
          animationType={plan.animationType}
          isGlowing={isFinalStep && isComplete}
          delay={isActive ? plan.delay : 0}
        />
      ))}

      {/* Connector arrow to next step */}
      <StepConnector
        x={centerX}
        y1={y + baseFontSize * 0.7}
        y2={y + baseFontSize * 0.7 + CONNECTOR_HEIGHT}
        opacity={isComplete ? 0.6 : 0}
      />
    </g>
  );
}
