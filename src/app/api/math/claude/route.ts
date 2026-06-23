import { NextRequest, NextResponse } from "next/server";

// Math tutor endpoint — Wolfram-first with a GPT-4o word-problem fallback.
//
// Wolfram Alpha is the source of truth for ALL equation-shaped math. The
// problem: Wolfram parses symbolic input beautifully but is hit-or-miss on
// English / French word problems ("Alice has 5 apples and gives 2 to Bob…")
// — long natural-language prompts often return no usable pods.
//
// Resolution order on POST:
//   1. Wolfram LLM API (CAG key) — rich tutor-style text.
//   2. Wolfram AgentOne Full Results — pod-by-pod synthesis.
//   3. If both fail AND the input looks like a WORD problem (many
//      natural-language words, not a bare equation) → GPT-4o.
//
// Pure equations never reach GPT — if Wolfram can't solve them we surface
// a Wolfram error instead, per the platform owner's rule that equations
// always go through Wolfram.

const CAG_KEY = process.env.WOLFRAM_CAG_KEY;
const AGENT_KEY = process.env.WOLFRAM_AGENTONE_KEY;
const FULL_KEY = process.env.WOLFRAM_APP_ID;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

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

/** Heuristic: does this input look like a WORD problem (long natural-
 *  language story) rather than a bare equation Wolfram could parse?
 *
 *  We strip math operators, numbers and lone symbol variables, then count
 *  what's left. A pure equation like "x^2 + 5x - 6 = 0" leaves zero word
 *  tokens; a sentence like "Alice has 5 apples and gives 2 to Bob — how
 *  many does she have left?" leaves a dozen. 8+ word tokens triggers the
 *  GPT fallback. */
function isWordProblem(input: string): boolean {
  const stripped = input
    .replace(/\$\$?[^$]*\$\$?/g, " ")          // strip LaTeX math
    .replace(/[0-9+\-*/^=()<>≤≥%!,;:]+/g, " "); // strip operators / numbers
  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length >= 2 && /^[A-Za-zÀ-ÿ']+$/.test(w));
  return words.length >= 8;
}

/** GPT-4o fallback for word problems Wolfram can't parse. Returns Markdown
 *  with $$...$$ math blocks so the existing KaTeX-aware chat bubble renders
 *  it the same as Wolfram's output. */
async function tryOpenAIWordProblem(problem: string): Promise<string | null> {
  if (!OPENAI_KEY) return null;

  const system = `You are a math tutor solving a WORD PROBLEM. The problem may be in English, French, or another language — answer in the same language.

Return Markdown with this exact structure (do NOT include a top-level title):

### Solution

**Understanding the problem:**
(briefly restate what's being asked, in plain language)

**Set up:**
(define variables and write the equations needed; wrap every math expression in $$...$$ for KaTeX)

**Step-by-step:**
1. ...
2. ...
3. ...

**Answer:** $$<final answer>$$

**Check:** (one short sentence verifying the answer makes physical sense)

Rules:
- Wrap EVERY math expression in $$...$$. Never inline raw operators.
- Be precise and verify by substitution / unit check.
- Keep prose concise — students want the steps, not an essay.
- Output ONLY the Markdown body. No code fences, no preamble.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: problem },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text || !text.trim()) return null;
    return `${text.trim()}\n\n---\n*Word-problem solved by GPT-4o (Wolfram Alpha could not parse this query).*`;
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
  const wordProblem = isWordProblem(problem);

  // 1) Wolfram LLM API (CAG) — rich tutor-style text.
  let formatted = await tryWolframLLM(problem);
  // 2) Fallback to AgentOne Full Results pods.
  if (!formatted) formatted = await tryWolframFullResults(problem);
  // 3) Word-problem fallback — GPT-4o. Only fires for natural-language
  //    problems, never for bare equations (per the platform's
  //    Wolfram-only-for-equations rule).
  if (!formatted && wordProblem) {
    formatted = await tryOpenAIWordProblem(problem);
  }

  if (!formatted) {
    const message = wordProblem
      ? OPENAI_KEY
        ? "Couldn't solve this word problem. Try rephrasing it more simply."
        : "Wolfram Alpha couldn't parse this word problem, and OPENAI_API_KEY isn't configured for the fallback."
      : "Wolfram Alpha could not produce an answer for this query.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
  return streamText(formatted);
}
