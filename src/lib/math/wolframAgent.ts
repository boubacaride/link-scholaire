// Wolfram AgentOne client — conversational AI tutor for math, physics, chemistry

export interface WolframAgentPod {
  title: string;
  id: string;
  primary: boolean;
  subpods: { title: string; plaintext: string; img: string | null }[];
}

export interface WolframAgentResult {
  answer: string;
  answerImage?: string | null;
  pods?: WolframAgentPod[];
  text?: string;
  stepByStep?: string | null;
  mode: "full" | "llm";
  error?: string;
}

/**
 * Ask Wolfram AgentOne a question — returns structured answer with pods and images.
 * Works for math, physics, chemistry, and general science questions.
 */
export async function askWolframAgent(
  query: string,
  context?: string,
  subject?: string
): Promise<WolframAgentResult> {
  try {
    const res = await fetch("/api/math/wolfram-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context, subject }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      return { answer: "", mode: "full", error: err.error };
    }

    return await res.json();
  } catch (error: unknown) {
    return { answer: "", mode: "full", error: "Connection failed" };
  }
}
