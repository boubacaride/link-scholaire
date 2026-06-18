import { NextRequest, NextResponse } from "next/server";

// Math tutor endpoint — Wolfram Alpha backed (no OpenAI dependency).
//
// Originally this route hit OpenAI GPT-4o. The platform owner asked to use
// Wolfram Alpha for ALL math / physics / chemistry solving so there's no
// OpenAI key required. We now call the Wolfram LLM API (CAG key) first,
// fall back to the AgentOne Full Results API, and stream the formatted
// answer back as plain text so the existing `askClaudeStreaming` client
// keeps working unchanged (same content-type, same chunked body).
//
// The route extracts the actual math problem from tutor-style prompts
// like "Solve this math problem step by step ... Problem: <eq>" so the
// upstream Wolfram query is clean.

const CAG_KEY = process.env.WOLFRAM_CAG_KEY;
const AGENT_KEY = process.env.WOLFRAM_AGENTONE_KEY;
const FULL_KEY = process.env.WOLFRAM_APP_ID;

/** Pull the actual math out of a tutor-style wrapper. */
function extractProblem(raw: string): string {
  const trimmed = raw.trim();
  // Match the prompt prefixes we know the math page sends.
  const markers = [
    /problem\s*:\s*([\s\S]+)$/i,
    /question\s*:\s*([\s\S]+)$/i,
    /solve\s*:\s*([\s\S]+)$/i,
    /explain step by step how to solve\s*:\s*([\s\S]+)$/i,
  ];
  for (const re of markers) {
    const m = trimmed.match(re);
    if (m) return m[1].trim();
  }
  return trimmed;
}

/** Replace unicode math glyphs with ASCII Wolfram understands. */
function cleanForWolfram(input: string): string {
  return input
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/·/g, "*")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi");
}

/** Heuristic: does this line look like a math expression worth wrapping
 *  in $$...$$ for KaTeX rendering? */
function isMathLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/^[A-Z][A-Za-z ]+:$/.test(s)) return false; // section header
  if (/^image:|^Wolfram\|Alpha/i.test(s)) return false;
  // contains an operator or equation marker
  return /[=+\-*/^()<>≤≥]/.test(s) || /\b(?:x|y|z|sqrt|pi|sin|cos|tan|log|ln|d\/d[xyt])\b/.test(s);
}

/** Convert the raw Wolfram LLM API text into Markdown + LaTeX so it
 *  renders nicely in the existing KaTeX-aware chat bubble. */
function formatWolframLLMText(raw: string, original: string): string {
  const out: string[] = [];
  let wolframUrl = "";

  out.push(`### Solution`);
  out.push(``);

  for (const lineRaw of raw.split("\n")) {
    const line = lineRaw.trimEnd();
    if (!line.trim()) { out.push(""); continue; }

    const imgMatch = line.match(/^image:\s*(https?:\/\/\S+)/i);
    if (imgMatch) {
      out.push(`![figure](${imgMatch[1]})`);
      continue;
    }
    const urlMatch = line.match(/^Wolfram\|Alpha website result.+:\s*(https?:\/\/\S+)/i);
    if (urlMatch) { wolframUrl = urlMatch[1]; continue; }

    // Section header like "Result:" or "Solutions:"
    const headerMatch = line.match(/^([A-Z][A-Za-z ]+):$/);
    if (headerMatch) { out.push(`**${headerMatch[1]}:**`); continue; }

    if (isMathLine(line)) {
      out.push(`$$${line.trim()}$$`);
    } else {
      out.push(line);
    }
  }

  out.push("");
  out.push(`---`);
  out.push(`*Verified by Wolfram Alpha${wolframUrl ? ` — [open full result](${wolframUrl})` : ""}.*`);
  return out.join("\n");
}

/** Call the Wolfram LLM API (CAG key). Returns the formatted Markdown
 *  string, or null if the request didn't yield a usable answer. */
async function tryWolframLLM(problem: string): Promise<string | null> {
  if (!CAG_KEY) return null;
  const encoded = encodeURIComponent(cleanForWolfram(problem));
  const url = `https://www.wolframalpha.com/api/v1/llm-api?input=${encoded}&appid=${CAG_KEY}&maxchars=4000`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return formatWolframLLMText(text, problem);
  } catch {
    return null;
  }
}

/** Fallback to the AgentOne Full Results API: build a Markdown explanation
 *  from the pod plaintexts (Input, Result, Solution, Step-by-step, etc.). */
async function tryWolframFullResults(problem: string): Promise<string | null> {
  const key = AGENT_KEY || FULL_KEY;
  if (!key) return null;
  const encoded = encodeURIComponent(cleanForWolfram(problem));
  const url = `https://api.wolframalpha.com/v2/query?appid=${key}&input=${encoded}&output=json&format=image,plaintext&width=500`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;
    const data = await res.json();
    const pods = data?.queryresult?.pods;
    if (!Array.isArray(pods) || pods.length === 0) return null;

    const out: string[] = [`### Solution`, ``];
    for (const pod of pods) {
      const title = pod.title || "";
      const subpods = pod.subpods || [];
      const texts: string[] = subpods.map((sp: any) => (sp.plaintext || "").trim()).filter(Boolean);
      const imgs: string[] = subpods.map((sp: any) => sp.img?.src).filter(Boolean);
      if (!texts.length && !imgs.length) continue;
      out.push(`**${title}:**`);
      for (const t of texts) {
        out.push(isMathLine(t) ? `$$${t}$$` : t);
      }
      for (const src of imgs) out.push(`![${title}](${src})`);
      out.push("");
    }
    out.push(`---`);
    out.push(`*Verified by Wolfram Alpha.*`);
    return out.join("\n");
  } catch {
    return null;
  }
}

/** Stream a plain-text body in line-sized chunks so the chat bubble's
 *  typewriter UX still feels alive. */
function streamText(body: string): Response {
  const encoder = new TextEncoder();
  const lines = body.split("\n");
  const stream = new ReadableStream({
    async start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
        // Tiny yield so the browser paints between chunks.
        await new Promise((r) => setTimeout(r, 8));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

export async function POST(req: NextRequest) {
  let body: { question?: string; subject?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { question } = body;
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "A non-empty 'question' field is required." }, { status: 400 });
  }
  if (!CAG_KEY && !AGENT_KEY && !FULL_KEY) {
    return NextResponse.json(
      { error: "No Wolfram Alpha key is configured (set WOLFRAM_CAG_KEY or WOLFRAM_AGENTONE_KEY)." },
      { status: 500 },
    );
  }

  const problem = extractProblem(question);

  // 1) Wolfram LLM API (CAG) — rich tutor-style text.
  let formatted = await tryWolframLLM(problem);
  // 2) Fallback to AgentOne Full Results pods.
  if (!formatted) formatted = await tryWolframFullResults(problem);

  if (!formatted) {
    return NextResponse.json(
      { error: "Wolfram Alpha could not produce an answer for this query." },
      { status: 422 },
    );
  }
  return streamText(formatted);
}
