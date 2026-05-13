import { NextRequest, NextResponse } from "next/server";

// Wolfram AgentOne API — conversational AI tutor
// Uses the AgentOne key for interactive Q&A about math, physics, chemistry

export async function POST(req: NextRequest) {
  const appId = process.env.WOLFRAM_AGENTONE_KEY;
  if (!appId) {
    return NextResponse.json({ error: "WOLFRAM_AGENTONE_KEY is not configured." }, { status: 500 });
  }

  let body: { query?: string; context?: string; subject?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { query, context, subject } = body;
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "A 'query' field is required." }, { status: 400 });
  }

  // Build the query — include context if available
  let fullQuery = query.trim();
  if (context) {
    fullQuery = `${context}. ${fullQuery}`;
  }

  const cleaned = fullQuery
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/·/g, "*");

  try {
    // Use Full Results API with AgentOne key for ALL pods with images
    const encoded = encodeURIComponent(cleaned);
    const url = `https://api.wolframalpha.com/v2/query?appid=${appId}&input=${encoded}&output=json&format=image,plaintext&width=500`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });

    if (!res.ok) {
      // Fallback to LLM API format
      const llmUrl = `https://www.wolframalpha.com/api/v1/llm-api?input=${encoded}&appid=${appId}&maxchars=3000`;
      const llmRes = await fetch(llmUrl, { signal: AbortSignal.timeout(15000) });

      if (llmRes.ok) {
        const text = await llmRes.text();
        return NextResponse.json({ text, mode: "llm" });
      }

      return NextResponse.json({ error: `Wolfram API error (${res.status})` }, { status: res.status });
    }

    const data = await res.json();
    const queryResult = data?.queryresult;

    if (!queryResult?.success || !queryResult?.pods?.length) {
      // Try LLM API as fallback
      const llmUrl = `https://www.wolframalpha.com/api/v1/llm-api?input=${encoded}&appid=${appId}&maxchars=3000`;
      const llmRes = await fetch(llmUrl, { signal: AbortSignal.timeout(15000) });

      if (llmRes.ok) {
        const text = await llmRes.text();
        return NextResponse.json({ text, mode: "llm" });
      }

      return NextResponse.json({ error: "Could not find an answer." }, { status: 422 });
    }

    // Extract ALL pods with ALL subpods
    const pods = queryResult.pods.map((pod: any) => ({
      title: pod.title,
      id: pod.id,
      primary: pod.primary || false,
      subpods: (pod.subpods || []).map((sp: any) => ({
        title: sp.title || "",
        plaintext: sp.plaintext || "",
        img: sp.img?.src || null,
      })),
    }));

    // Find the main answer
    const answerPod = queryResult.pods.find((p: any) => p.primary) ||
      queryResult.pods.find((p: any) => ["Result", "Solution", "NumericalSolution", "RealSolution"].includes(p.id)) ||
      queryResult.pods[1];

    // Collect ALL plaintext from the answer pod (multiple solutions)
    const answerTexts = (answerPod?.subpods || [])
      .map((sp: any) => sp.plaintext)
      .filter(Boolean);
    const answer = answerTexts.join("\n");
    const answerImage = answerPod?.subpods?.[0]?.img?.src || null;

    // Build a summary of all pods for step-by-step generation context
    const allPodsText = pods.map((p: any) => {
      const subTexts = p.subpods.map((sp: any) => sp.plaintext).filter(Boolean).join("; ");
      return `${p.title}: ${subTexts}`;
    }).filter((s: string) => s.length > 3).join("\n");

    // Generate step-by-step solution using GPT-4o with Wolfram's verified answer
    let stepByStep: string | null = null;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && answer) {
      try {
        const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o",
            temperature: 0.1,
            max_tokens: 3000,
            messages: [
              {
                role: "system",
                content: `You are a mathematics tutor. Show the step-by-step solution for a math problem. The correct answer from Wolfram Alpha is provided — your job is to show HOW to get there.

FORMAT (follow EXACTLY):
STEP 1: [description of what you're doing]
$$[equation after this step]$$

STEP 2: [description]
$$[equation after this step]$$

...continue until the answer...

STEP N: Final answer
$$[final answer equation]$$

RULES:
- Use EXACTLY the format above: "STEP N:" followed by description, then "$$equation$$" on the next line.
- Each step must have BOTH a description AND an equation.
- Show ALL intermediate steps — do not skip any.
- Use $$...$$ for ALL equations (display math only, one per line).
- Do NOT use $...$ inline math in step descriptions.
- Do NOT use \\[...\\] or \\(...\\) delimiters.
- Do NOT duplicate expressions.
- Do NOT contradict the verified answer.
- Keep descriptions SHORT (one sentence).`
              },
              {
                role: "user",
                content: `Problem: ${query}

Wolfram Alpha's verified answer:
${allPodsText}

Show the complete step-by-step solution leading to: ${answer}`
              }
            ],
          }),
        });

        if (gptRes.ok) {
          const gptData = await gptRes.json();
          stepByStep = gptData.choices?.[0]?.message?.content || null;
        }
      } catch { /* step-by-step generation failed, continue without it */ }
    }

    return NextResponse.json({
      answer,
      answerImage,
      pods,
      stepByStep,
      mode: "full",
      subject: subject || "general",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Wolfram Agent failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
