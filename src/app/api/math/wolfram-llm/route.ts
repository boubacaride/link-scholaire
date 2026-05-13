import { NextRequest, NextResponse } from "next/server";

// Wolfram LLM API — optimized text output for display and LLM consumption
// Uses the CAG API key for rich computational results

export async function POST(req: NextRequest) {
  const appId = process.env.WOLFRAM_CAG_KEY;
  if (!appId) {
    return NextResponse.json({ error: "WOLFRAM_CAG_KEY is not configured." }, { status: 500 });
  }

  let body: { query?: string; maxchars?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { query, maxchars = 4000 } = body;
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "A 'query' field is required." }, { status: 400 });
  }

  // Clean the input
  const cleaned = query.trim()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/·/g, "*")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi");

  const encoded = encodeURIComponent(cleaned);

  try {
    const url = `https://www.wolframalpha.com/api/v1/llm-api?input=${encoded}&appid=${appId}&maxchars=${maxchars}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });

    if (res.status === 501) {
      const text = await res.text();
      return NextResponse.json({ error: "Could not interpret query", suggestions: text }, { status: 422 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Wolfram LLM API error (${res.status})` }, { status: res.status });
    }

    const text = await res.text();

    // Parse the text response into structured sections
    const sections: { title: string; content: string; image?: string }[] = [];
    let currentTitle = "";
    let currentContent = "";
    let wolframUrl = "";

    const lines = text.split("\n");
    for (const line of lines) {
      // Check for image URLs
      const imgMatch = line.match(/^image:\s*(https?:\/\/.+)$/);
      if (imgMatch) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.trim(), image: imgMatch[1] });
          currentContent = "";
        }
        continue;
      }

      // Check for Wolfram Alpha website result URL
      const urlMatch = line.match(/^Wolfram\|Alpha website result.+:\s*(https?:\/\/.+)$/);
      if (urlMatch) {
        wolframUrl = urlMatch[1];
        continue;
      }

      // Check for section headers (lines ending with :)
      const headerMatch = line.match(/^([A-Z][^:]+):$/);
      if (headerMatch && !line.includes("image:")) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.trim() });
        }
        currentTitle = headerMatch[1];
        currentContent = "";
        continue;
      }

      // Regular content line
      if (line.trim()) {
        currentContent += (currentContent ? "\n" : "") + line;
      }
    }

    // Push last section
    if (currentTitle) {
      sections.push({ title: currentTitle, content: currentContent.trim() });
    }

    // Extract the main answer
    const resultSection = sections.find(s =>
      s.title.toLowerCase().includes("result") ||
      s.title.toLowerCase().includes("solution") ||
      s.title.toLowerCase().includes("answer")
    );

    return NextResponse.json({
      rawText: text,
      sections,
      answer: resultSection?.content || sections[1]?.content || "",
      wolframUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Wolfram LLM API failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
