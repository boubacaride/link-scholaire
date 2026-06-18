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

    // Wolfram-only step-by-step: prefer the pod Wolfram itself labels as
    // "Step-by-step solution" / "Possible intermediate steps"; if none,
    // synthesize one from all pod plaintexts. No OpenAI involvement —
    // the platform deliberately runs without an OpenAI key.
    const stepPod = queryResult.pods.find((p: any) => {
      const t = (p.title || "").toLowerCase();
      const id = (p.id || "").toLowerCase();
      return t.includes("step-by-step") || t.includes("intermediate steps") || id.includes("step");
    });
    let stepByStep: string | null = null;
    if (stepPod) {
      const lines: string[] = [];
      for (const sp of stepPod.subpods || []) {
        if (sp.plaintext) lines.push(sp.plaintext);
      }
      if (lines.length) stepByStep = lines.join("\n\n");
    }
    if (!stepByStep && answer) {
      // Fall back to a structured walk through the pods so the UI still
      // gets something useful to render as steps.
      const ordered = pods
        .filter((p: any) => p.subpods.some((sp: any) => sp.plaintext))
        .map((p: any, i: number) => {
          const txt = p.subpods.map((sp: any) => sp.plaintext).filter(Boolean).join("\n");
          return `STEP ${i + 1}: ${p.title}\n$$${txt}$$`;
        });
      if (ordered.length) stepByStep = ordered.join("\n\n");
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
