// GPT-4o structured solver — returns SolutionData compatible with VisualizationEngine

import { type SolutionData, type SolutionStep } from "@/lib/equationSolver";

// Fix common GPT spacing issues: "Substitutingx=3" → "Substituting x = 3"
function fixSpacing(text: string): string {
  return text
    // Add space before lowercase letter followed by = or variable
    .replace(/([a-z])([A-Z])/g, "$1 $2")           // "intooriginal" → "into original"
    .replace(/([a-zA-Z])(=)/g, "$1 $2")             // "x=" → "x ="
    .replace(/(=)(\d)/g, "$1 $2")                    // "=300" → "= 300"
    .replace(/(=)([a-zA-Z])/g, "$1 $2")             // "=x" → "= x"
    .replace(/(\d)([a-zA-Z])/g, (_, d, l) => {
      // Don't break things like "x10" or "ln" — only split when a word follows a number
      if (/^[a-z]/.test(l) && !/^[xyznepi]$/i.test(l)) return `${d} ${l}`;
      return `${d}${l}`;
    })
    .replace(/([,.:;])([a-zA-Z])/g, "$1 $2")        // ",RHS" → ", RHS"
    .replace(/([a-z])(LHS|RHS)/g, "$1 $2")          // "originalLHS" → "original LHS"
    .replace(/  +/g, " ")                             // collapse multiple spaces
    .trim();
}

interface GPTSolveResult {
  originalEquation: string;
  equationType: string;
  variable: string;
  steps: { stepNumber: number; description: string; afterEquation: string }[];
  solution: Record<string, string | number>;
  verification?: string;
  error?: string;
}

/**
 * Call GPT-4o to solve an equation and return structured steps
 * that can be fed to the VisualizationEngine animation.
 */
export async function solveWithGPT(equation: string): Promise<{
  solutionData: SolutionData | null;
  answer: string;
  verification: string;
  error?: string;
}> {
  try {
    const response = await fetch("/api/math/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equation }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Request failed" }));
      return { solutionData: null, answer: "", verification: "", error: err.error };
    }

    const data: GPTSolveResult = await response.json();

    if (data.error) {
      return { solutionData: null, answer: "", verification: "", error: data.error };
    }

    // Convert GPT steps to SolutionData format for animation
    const steps: SolutionStep[] = [];

    // Step 0: display original equation — always use the raw user input
    steps.push({
      stepNumber: 0,
      description: "Original equation",
      operation: "display",
      beforeEquation: equation,
      afterEquation: equation,
      termMovements: [],
      duration: 1200,
    });

    // Convert each GPT step
    (data.steps || []).forEach((gptStep, i) => {
      const prevEq = i === 0 ? (data.originalEquation || equation) : (data.steps[i - 1]?.afterEquation || "");

      steps.push({
        stepNumber: i + 1,
        description: fixSpacing(gptStep.description),
        operation: "simplify",
        beforeEquation: fixSpacing(prevEq),
        afterEquation: fixSpacing(gptStep.afterEquation),
        termMovements: [{
          termId: `step-${i}`,
          term: gptStep.afterEquation,
          fromSide: "left",
          fromIndex: 0,
          toSide: "left",
          toIndex: 0,
          transformation: "simplify",
          resultingTerm: gptStep.afterEquation,
          animationType: i === (data.steps.length - 1) ? "bounce" : "slide_down",
          color: i === (data.steps.length - 1) ? "#00d2d3" : "#ffffff",
          duration: 1500,
        }],
        duration: 1500,
      });
    });

    // Verification step if available
    if (data.verification) {
      const fixedVerification = fixSpacing(data.verification);
      steps.push({
        stepNumber: steps.length,
        description: "Verification",
        operation: "verify",
        beforeEquation: fixedVerification,
        afterEquation: fixedVerification,
        termMovements: [{
          termId: "verify",
          term: "✓",
          fromSide: "left",
          fromIndex: 0,
          toSide: "left",
          toIndex: 0,
          transformation: "none",
          resultingTerm: "✓ Verified",
          animationType: "bounce",
          color: "#00d2d3",
          duration: 1500,
        }],
        duration: 1500,
      });
    }

    // Build answer string
    const answer = Object.entries(data.solution || {})
      .map(([k, v]) => `${k} = ${v}`)
      .join(", ");

    const solutionData: SolutionData = {
      originalEquation: equation,
      equationType: data.equationType || "equation",
      variable: data.variable || "x",
      steps,
      solution: data.solution || {},
      canGraph: false,
    };

    return {
      solutionData,
      answer: answer || "See steps",
      verification: data.verification || "",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "GPT solver failed";
    return { solutionData: null, answer: "", verification: "", error: message };
  }
}
