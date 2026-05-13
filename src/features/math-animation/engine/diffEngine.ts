// EquationDiffEngine: Computes differences between equation states
// and generates AnimationSteps. Also parses GPT step-by-step text.

import type { AnimationStep, EquationState, HighlightState, MathToken } from "./types";
import { parseEquation } from "./tokenizer";
import { BASE_DURATIONS } from "./types";

/** Find tokens that changed between two states */
function findChangedTokens(before: MathToken[], after: MathToken[]) {
  const beforeTexts = new Map<string, MathToken>();
  const afterTexts = new Map<string, MathToken>();
  before.forEach((t) => beforeTexts.set(t.text + "_" + t.side, t));
  after.forEach((t) => afterTexts.set(t.text + "_" + t.side, t));

  const added: MathToken[] = [];
  const removed: MathToken[] = [];
  const moved: Array<{ from: MathToken; to: MathToken }> = [];
  const unchanged: MathToken[] = [];

  beforeTexts.forEach((token, key) => {
    const afterToken = afterTexts.get(key);
    if (afterToken) {
      unchanged.push(afterToken);
    } else {
      const otherSide = token.side === "lhs" ? "rhs" : "lhs";
      const movedToken = afterTexts.get(token.text + "_" + otherSide);
      if (movedToken) moved.push({ from: token, to: movedToken });
      else removed.push(token);
    }
  });

  afterTexts.forEach((token, key) => {
    if (!beforeTexts.has(key)) {
      const otherSide = token.side === "lhs" ? "rhs" : "lhs";
      if (!beforeTexts.has(token.text + "_" + otherSide)) added.push(token);
    }
  });

  return { added, removed, moved, unchanged };
}

function determineHighlight(description: string): HighlightState {
  const d = description.toLowerCase();
  if (d.includes("answer") || d.includes("solution") || d.includes("result") || d.includes("final")) return "result";
  if (d.includes("simplif") || d.includes("combine") || d.includes("collect")) return "simplified";
  if (d.includes("cancel")) return "cancelled";
  return "active";
}

/** Build AnimationSteps from parsed step list */
export function buildAnimationSteps(
  steps: Array<{ description: string; equation: string }>,
  speed: number = 1.0,
): AnimationStep[] {
  if (steps.length === 0) return [];

  return steps.map((step, i) => {
    const prevEq = i > 0 ? steps[i - 1]!.equation : step.equation;
    const beforeState = parseEquation(prevEq);
    const afterState = parseEquation(step.equation);
    const { added, removed, moved } = findChangedTokens(beforeState.tokens, afterState.tokens);

    const highlightIds: string[] = [];
    moved.forEach(({ to }) => highlightIds.push(to.id));
    added.forEach((t) => highlightIds.push(t.id));

    let duration = BASE_DURATIONS.highlight;
    if (moved.length > 0) duration = BASE_DURATIONS.move;
    else if (removed.length > 0) duration = BASE_DURATIONS.simplify;
    else if (added.length > 0) duration = BASE_DURATIONS.collapse;

    return {
      stepNumber: i + 1,
      description: step.description,
      beforeState,
      afterState,
      highlightTokenIds: highlightIds,
      highlightType: determineHighlight(step.description),
      durationMs: Math.round(duration / speed),
    };
  });
}

/** Parse GPT/AI step-by-step text into structured steps.
 *  Very flexible — handles many output formats from GPT. */
export function parseStepByStepText(
  text: string,
  originalEquation: string,
): Array<{ description: string; equation: string }> {
  if (!text || !text.trim()) return [];

  const steps: Array<{ description: string; equation: string }> = [];
  const lines = text.split("\n");

  let currentDesc = "";
  let currentEq = originalEquation;
  let inDisplayMath = false;
  let mathBuffer = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] || "";
    const line = raw.trim();

    // Handle multi-line display math $$
    if (line === "$$" && !inDisplayMath) {
      inDisplayMath = true;
      mathBuffer = "";
      continue;
    }
    if (line === "$$" && inDisplayMath) {
      inDisplayMath = false;
      if (mathBuffer.trim()) currentEq = mathBuffer.trim();
      continue;
    }
    if (inDisplayMath) {
      mathBuffer += (mathBuffer ? " " : "") + line;
      continue;
    }

    // Single-line display math $$...$$
    const singleMath = line.match(/^\$\$(.+)\$\$$/);
    if (singleMath) {
      currentEq = singleMath[1]!.trim();
      continue;
    }

    // Detect step headers — many possible formats
    const stepPatterns = [
      /^(?:\*\*)?STEP\s*(\d+)[:.]\s*\*?\*?\s*(.*)/i,           // STEP 1: ... or **STEP 1:**
      /^(?:\*\*)?#{1,4}\s*Step\s*(\d+)[:.]\s*\*?\*?\s*(.*)/i,   // ### Step 1:
      /^(\d+)\.\s+(.+)/,                                         // 1. description
      /^(?:\*\*)?Step\s*(\d+)[:.]\s*\*?\*?\s*(.*)/i,             // Step 1: ...
      /^-\s*\*?\*?Step\s*(\d+)\*?\*?[:.]\s*(.*)/i,               // - **Step 1:** ...
    ];

    let isStepHeader = false;
    for (const pattern of stepPatterns) {
      const match = line.match(pattern);
      if (match) {
        // Save previous step
        if (currentDesc) {
          steps.push({ description: cleanDescription(currentDesc), equation: currentEq });
        }
        currentDesc = match[2]?.trim() || `Step ${match[1]}`;
        isStepHeader = true;
        break;
      }
    }
    if (isStepHeader) continue;

    // Section headers like ### Verification, ### Answer
    const sectionMatch = line.match(/^#{1,4}\s+(.+)/);
    if (sectionMatch) {
      if (currentDesc) {
        steps.push({ description: cleanDescription(currentDesc), equation: currentEq });
      }
      currentDesc = sectionMatch[1]!.trim();
      continue;
    }

    // Skip empty lines
    if (!line) continue;

    // Check if line contains an equation (has = and math-like content)
    const hasEquals = line.includes("=") && /[a-zA-Z0-9()^]/.test(line);
    const cleanedLine = line.replace(/^\$+|\$+$/g, "").replace(/\\\(|\\\)/g, "").trim();

    if (hasEquals && cleanedLine.length > 3 && cleanedLine.length < 200) {
      // This looks like an equation
      currentEq = cleanedLine;
    }

    // Append to current description if it's meaningful text
    if (line.length > 3 && !hasEquals) {
      const textContent = line.replace(/\*\*/g, "").replace(/^\$+|\$+$/g, "").trim();
      if (textContent.length > 3) {
        if (currentDesc) currentDesc += " " + textContent;
        else currentDesc = textContent;
      }
    }
  }

  // Push final step
  if (currentDesc) {
    steps.push({ description: cleanDescription(currentDesc), equation: currentEq });
  }

  // If no steps were parsed, create a single step from the whole text
  if (steps.length === 0 && text.trim().length > 0) {
    // Split text into chunks by double newlines as rough steps
    const chunks = text.split(/\n\n+/).filter((c) => c.trim().length > 10);
    if (chunks.length > 0) {
      for (const chunk of chunks) {
        const firstLine = chunk.split("\n")[0]?.trim() || "Working...";
        steps.push({
          description: cleanDescription(firstLine),
          equation: originalEquation,
        });
      }
    } else {
      steps.push({
        description: cleanDescription(text.split("\n")[0] || "Solving..."),
        equation: originalEquation,
      });
    }
  }

  return steps;
}

/** Clean up description text */
function cleanDescription(desc: string): string {
  return desc
    .replace(/\*\*/g, "")           // remove markdown bold
    .replace(/^\$+|\$+$/g, "")     // remove $ delimiters
    .replace(/\\\(|\\\)/g, "")     // remove \( \)
    .replace(/#{1,4}\s*/g, "")     // remove headers
    .replace(/\s+/g, " ")          // collapse spaces
    .trim()
    .slice(0, 200);                // max length
}
