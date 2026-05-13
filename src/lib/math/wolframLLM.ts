// Wolfram LLM API client — rich text computational results

export interface WolframLLMSection {
  title: string;
  content: string;
  image?: string;
}

export interface WolframLLMResult {
  rawText: string;
  sections: WolframLLMSection[];
  answer: string;
  wolframUrl: string;
  error?: string;
}

export async function queryWolframLLM(query: string, maxchars = 4000): Promise<WolframLLMResult> {
  try {
    const res = await fetch("/api/math/wolfram-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxchars }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      return { rawText: "", sections: [], answer: "", wolframUrl: "", error: err.error };
    }

    return await res.json();
  } catch (error: unknown) {
    return { rawText: "", sections: [], answer: "", wolframUrl: "", error: "Connection failed" };
  }
}
