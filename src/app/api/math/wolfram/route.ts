import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const appId = process.env.WOLFRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "WOLFRAM_APP_ID is not configured." }, { status: 500 });
  }

  let body: { query?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { query, mode = "full" } = body;
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "A 'query' field is required." }, { status: 400 });
  }

  // Clean the input for Wolfram — do NOT add "solve" prefix, it reduces the number of pods
  let wolframQuery = query.trim()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/·/g, "*")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi");

  const encoded = encodeURIComponent(wolframQuery);

  try {
    if (mode === "short") {
      const url = `https://api.wolframalpha.com/v1/result?appid=${appId}&i=${encoded}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: text || `Wolfram API error (${res.status})` }, { status: res.status });
      }
      const answer = await res.text();
      return NextResponse.json({ answer, mode: "short" });
    }

    // Full Results API — request ALL pods with images + step-by-step solutions
    const url = `https://api.wolframalpha.com/v2/query?appid=${appId}&input=${encoded}&output=json&format=image,plaintext&width=500&podstate=Step-by-step+solution&podstate=Step-by-step&podstate=Show+all+steps`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });

    if (!res.ok) {
      return NextResponse.json({ error: `Wolfram API error (${res.status})` }, { status: res.status });
    }

    const data = await res.json();
    const queryResult = data?.queryresult;

    if (!queryResult || queryResult.success === false) {
      // Full API failed — try without includepodid to get ALL pods
      const fallbackUrl = `https://api.wolframalpha.com/v2/query?appid=${appId}&input=${encoded}&output=json&format=image,plaintext&width=500`;
      const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(15000) });

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const fbResult = fallbackData?.queryresult;

        if (fbResult?.success && fbResult?.pods?.length > 0) {
          return buildResponse(fbResult, query);
        }
      }

      // Try short answer as last resort
      const shortUrl = `https://api.wolframalpha.com/v1/result?appid=${appId}&i=${encodeURIComponent(query)}`;
      const shortRes = await fetch(shortUrl, { signal: AbortSignal.timeout(10000) });
      if (shortRes.ok) {
        const answer = await shortRes.text();
        return NextResponse.json({ answer, mode: "short", steps: [`Answer: ${answer}`] });
      }

      return NextResponse.json({
        error: "Wolfram Alpha could not interpret this query.",
        didyoumeans: queryResult?.didyoumeans || [],
      }, { status: 422 });
    }

    // If includepodid filtering returned no pods, retry without filter
    if (!queryResult.pods || queryResult.pods.length === 0) {
      const retryUrl = `https://api.wolframalpha.com/v2/query?appid=${appId}&input=${encoded}&output=json&format=image,plaintext&width=500`;
      const retryRes = await fetch(retryUrl, { signal: AbortSignal.timeout(15000) });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        if (retryData?.queryresult?.pods?.length > 0) {
          return buildResponse(retryData.queryresult, query);
        }
      }
    }

    return buildResponse(queryResult, query);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Wolfram request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildResponse(queryResult: any, originalQuery: string) {
  // Extract ALL pods
  const pods = (queryResult.pods || []).map((pod: any) => ({
    title: pod.title,
    id: pod.id,
    subpods: (pod.subpods || []).map((sp: any) => ({
      title: sp.title || "",
      plaintext: sp.plaintext || "",
      img: sp.img?.src || null,
    })),
  }));

  // Find the BEST answer pod — try many possible pod IDs
  const answerPodIds = [
    "Result", "Solution", "NumericalSolution", "RealSolution",
    "IntegerSolution", "ComplexSolution", "NumericalAnswer",
    "Decimal approximation", "DecimalApproximation", "ExactResult",
  ];

  const answerPodTitles = [
    "result", "solution", "numerical solution", "real solution",
    "numerical answer", "decimal approximation", "roots", "root",
    "exact solution", "approximate solution",
  ];

  let resultPod = null;

  // First try by ID
  for (const id of answerPodIds) {
    resultPod = queryResult.pods?.find((p: any) => p.id === id);
    if (resultPod) break;
  }

  // Then try by title (case-insensitive)
  if (!resultPod) {
    for (const title of answerPodTitles) {
      resultPod = queryResult.pods?.find((p: any) =>
        p.title?.toLowerCase().includes(title)
      );
      if (resultPod) break;
    }
  }

  // If still no result pod, pick the second pod (first is usually Input)
  if (!resultPod && queryResult.pods?.length > 1) {
    resultPod = queryResult.pods[1];
  }

  const inputPod = queryResult.pods?.find((p: any) =>
    p.id === "Input" || p.id === "InputInterpretation" || p.title?.toLowerCase() === "input"
  );

  // Extract answer text
  let answer = "";
  if (resultPod?.subpods) {
    // Collect all plaintext from result subpods
    answer = resultPod.subpods
      .map((sp: any) => sp.plaintext)
      .filter(Boolean)
      .join("\n");
  }

  const input = inputPod?.subpods?.[0]?.plaintext || originalQuery;

  // Build comprehensive steps from ALL pods
  const steps: string[] = [];
  for (const pod of queryResult.pods || []) {
    for (const sp of pod.subpods || []) {
      if (sp.plaintext) {
        steps.push(`${pod.title}: ${sp.plaintext}`);
      }
    }
  }

  return NextResponse.json({
    answer: answer || (steps.length > 0 ? steps[steps.length - 1] : ""),
    input,
    steps,
    pods,
    mode: "full",
  });
}
