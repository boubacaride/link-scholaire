// Math solve pipeline: WOLFRAM AGENTONE FIRST
// Educational tool — every answer MUST be correct.
//
// Pipeline order:
// 1. Graph/plot requests → Plotly graph
// 2. Natural language → GPT-4o for explanations
// 3. Simple arithmetic (2+3, 5!) → local solver (instant)
// 4. EVERYTHING ELSE → Wolfram AgentOne (primary solver for ALL math)
// 5. If AgentOne fails → Wolfram Full Results API (fallback)
// 6. If all Wolfram fails → GPT-4o (last resort)

import { solveEquation, type SolutionData } from "@/lib/equationSolver";
import { equationToLatex } from "./equationToLatex";
import { askWolframAgent } from "./wolframAgent";
import { solveWithWolfram } from "./wolframService";
import { queryWolframLLM } from "./wolframLLM";

export interface MathResult {
  type: "local" | "wolfram" | "newton" | "claude" | "error";
  answer: string;
  latex?: string;
  steps?: string[];
  localSolution?: SolutionData;
  graphable?: boolean;
  source: string;
  wolframPods?: any[];
  llmText?: string;
  wolframUrl?: string;
  graphExpression?: string;
  stepByStep?: string;
  originalQuery?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function isPureArithmetic(input: string): boolean {
  const cleaned = input.replace(/\s+/g, "");
  return /^[\d+\-*/().%^!]+$/.test(cleaned) && /[\d]/.test(cleaned);
}

function isFactorial(input: string): boolean {
  return /^\d+!$/.test(input.trim());
}

function isNaturalLanguage(input: string): boolean {
  const lower = input.trim().toLowerCase();
  if (/^(what|how|why|when|explain|show|prove|is|does|can|will|tell|describe|please|could)\b/.test(lower)) return true;
  const words = lower.split(/\s+/);
  if (words.length >= 5) return true;
  return false;
}

function isGraphRequest(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return /\b(plot|graph|draw|sketch|chart|visualize|show.*graph|show.*plot)\b/.test(lower);
}

function extractFunctionFromGraphRequest(input: string): string | null {
  const patterns = [
    /(?:plot|graph|draw|sketch|chart|visualize)\s+(?:the\s+)?(?:function\s+)?(?:of\s+)?(?:y\s*=\s*)?(.+)/i,
    /(?:show|display)\s+(?:the\s+)?(?:graph|plot)\s+(?:of\s+)?(?:y\s*=\s*)?(.+)/i,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) {
      const expr = m[1].trim().replace(/[?.!]+$/, "").trim();
      if (/[x0-9]/.test(expr) && !/^(the|this|that|it|area|result|answer|solution)$/i.test(expr)) {
        return expr;
      }
    }
  }
  return null;
}

// ─── Main Pipeline ──────────────────────────────────────────────

export async function solveMath(input: string): Promise<MathResult> {
  const trimmed = input.trim();

  if (!trimmed) {
    return { type: "error", answer: "Please enter a math expression.", source: "Error" };
  }

  // ── 1. Graph/plot requests ──
  if (isGraphRequest(trimmed)) {
    const funcExpr = extractFunctionFromGraphRequest(trimmed);
    if (funcExpr) {
      return {
        type: "wolfram",
        answer: `Graph of ${funcExpr}`,
        steps: [`Plotting: ${funcExpr}`],
        graphable: true,
        source: "Graph",
        graphExpression: funcExpr,
      };
    }
    return { type: "error", answer: "__USE_CLAUDE__", source: "GPT-4o" };
  }

  // ── 2. Natural language explanations → GPT-4o ──
  if (isNaturalLanguage(trimmed) && !/[=+\-*/^()]/.test(trimmed)) {
    // Only route to GPT if it's pure natural language with no math operators
    return { type: "error", answer: "__USE_CLAUDE__", source: "GPT-4o" };
  }

  // ── 3. Simple arithmetic → local solver (instant, safe) ──
  if (isPureArithmetic(trimmed) || isFactorial(trimmed)) {
    try {
      const localResult = solveEquation(trimmed);
      if (localResult) {
        const answer = Object.entries(localResult.solution)
          .map(([k, v]) => (k === "result" ? `${v}` : `${k} = ${v}`))
          .join(", ");
        return {
          type: "local",
          answer,
          latex: equationToLatex(answer),
          steps: localResult.steps.map((s) => `${s.description}: ${s.afterEquation}`),
          localSolution: localResult,
          graphable: false,
          source: "Calculator",
        };
      }
    } catch { /* fall through */ }
  }

  // ── 4. EVERYTHING ELSE → Wolfram AgentOne (PRIMARY SOLVER) ──
  // This handles: equations, differential equations, calculus, algebra, trig,
  // matrices, complex numbers, series, limits, and ANYTHING mathematical.
  try {
    const agentResult = await askWolframAgent(trimmed);

    if (!agentResult.error && (agentResult.answer || agentResult.pods?.length)) {
      const answer = agentResult.answer || "";
      const pods = agentResult.pods || [];

      // Build steps from pods
      const steps: string[] = [];
      for (const pod of pods) {
        for (const sp of pod.subpods || []) {
          if (sp.plaintext) {
            steps.push(`${pod.title}: ${sp.plaintext}`);
          }
        }
      }

      return {
        type: "wolfram",
        answer,
        latex: equationToLatex(answer),
        steps,
        graphable: false,
        source: "Wolfram Alpha",
        wolframPods: pods,
        stepByStep: agentResult.stepByStep || undefined,
        originalQuery: trimmed,
      };
    }
  } catch { /* fall through */ }

  // ── 5. Fallback: Wolfram Full Results API ──
  try {
    const wolframResult = await solveWithWolfram(trimmed);
    if (!wolframResult.error && wolframResult.answer) {
      // Also try LLM API for richer text
      const llmResult = await queryWolframLLM(trimmed).catch(() => null);

      return {
        type: "wolfram",
        answer: wolframResult.answer,
        latex: equationToLatex(wolframResult.answer),
        steps: wolframResult.steps || [],
        graphable: false,
        source: "Wolfram Alpha",
        wolframPods: wolframResult.pods,
        llmText: llmResult?.rawText || undefined,
        wolframUrl: llmResult?.wolframUrl || undefined,
      };
    }
  } catch { /* fall through */ }

  // ── 6. Last resort: route to GPT-4o ──
  return {
    type: "error",
    answer: "__USE_CLAUDE__",
    latex: equationToLatex(trimmed),
    source: "GPT-4o",
  };
}
