// Wolfram Alpha client service — calls /api/math/wolfram

export interface WolframResult {
  answer: string;
  input?: string;
  steps: string[];
  stepByStep?: string;
  pods?: WolframPod[];
  mode: "full" | "short";
  error?: string;
}

export interface WolframPod {
  title: string;
  id: string;
  subpods: { title: string; plaintext: string; img: string | null }[];
}

/**
 * Solve a math problem using Wolfram Alpha Full Results API.
 * Returns structured answer with steps.
 */
export async function solveWithWolfram(query: string): Promise<WolframResult> {
  try {
    const response = await fetch("/api/math/wolfram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, mode: "full" }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Request failed" }));
      return { answer: "", steps: [], mode: "full", error: err.error };
    }

    return await response.json();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Wolfram request failed";
    return { answer: "", steps: [], mode: "full", error: message };
  }
}

/**
 * Get a quick plain-text answer from Wolfram Alpha Short Answers API.
 */
export async function quickAnswer(query: string): Promise<string | null> {
  try {
    const response = await fetch("/api/math/wolfram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, mode: "short" }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.answer || null;
  } catch {
    return null;
  }
}
