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
//
// The response is Markdown the existing KaTeXRenderer understands:
//   • `### Title`  → styled heading
//   • `**Label:**` → bold inline
//   • `$$math$$`   → KaTeX block
// No horizontal rules, no italic footers, no Markdown link syntax — so
// nothing leaks through as raw `*`, `_` or `---` characters.

const CAG_KEY = process.env.WOLFRAM_CAG_KEY;
const AGENT_KEY = process.env.WOLFRAM_AGENTONE_KEY;
const FULL_KEY = process.env.WOLFRAM_APP_ID;
// OPENAI_API_KEY is read inside tryOpenAIWordProblem() so we can trim it and
// report exactly why a request failed (missing / wrong prefix / HTTP error).

// ─── i18n ─────────────────────────────────────────────────────────

type Locale = "en" | "fr" | "ar";

const LANG_NAME: Record<Locale, string> = {
  en: "English",
  fr: "French (français)",
  ar: "Arabic (العربية)",
};

const LABELS: Record<Locale, {
  solution: string;
  understandingProblem: string;
  setup: string;
  steps: string;
  answer: string;
  check: string;
  noClosedForm: string;
}> = {
  en: {
    solution: "Solution",
    understandingProblem: "Understanding the problem",
    setup: "Set up",
    steps: "Step by step",
    answer: "Answer",
    check: "Check",
    noClosedForm: "No closed-form solution.",
  },
  fr: {
    solution: "Solution",
    understandingProblem: "Compréhension du problème",
    setup: "Mise en équation",
    steps: "Étapes",
    answer: "Réponse",
    check: "Vérification",
    noClosedForm: "Pas de solution exacte.",
  },
  ar: {
    solution: "الحل",
    understandingProblem: "فهم المسألة",
    setup: "صياغة المعادلات",
    steps: "خطوة بخطوة",
    answer: "الإجابة",
    check: "التحقق",
    noClosedForm: "لا يوجد حل صريح.",
  },
};

// Map the most common Wolfram pod titles to per-locale equivalents. Anything
// not in this map falls back to the original English title.
const POD_TITLE_I18N: Record<string, { fr: string; ar: string }> = {
  "Input":                    { fr: "Entrée",                   ar: "المدخلات" },
  "Input interpretation":     { fr: "Interprétation",           ar: "التفسير" },
  "Result":                   { fr: "Résultat",                 ar: "النتيجة" },
  "Results":                  { fr: "Résultats",                ar: "النتائج" },
  "Solution":                 { fr: "Solution",                 ar: "الحل" },
  "Solutions":                { fr: "Solutions",                ar: "الحلول" },
  "Real solutions":           { fr: "Solutions réelles",        ar: "الحلول الحقيقية" },
  "Decimal approximation":    { fr: "Approximation décimale",   ar: "تقريب عشري" },
  "Decimal form":             { fr: "Forme décimale",           ar: "الصيغة العشرية" },
  "Step by step solution":    { fr: "Solution étape par étape", ar: "الحل خطوة بخطوة" },
  "Plot":                     { fr: "Graphique",                ar: "الرسم البياني" },
  "Plots":                    { fr: "Graphiques",               ar: "الرسوم" },
  "Derivative":               { fr: "Dérivée",                  ar: "المشتقة" },
  "Indefinite integral":      { fr: "Intégrale indéfinie",      ar: "التكامل غير المحدد" },
  "Definite integral":        { fr: "Intégrale définie",        ar: "التكامل المحدد" },
  "Number line":              { fr: "Axe numérique",            ar: "خط الأعداد" },
  "Properties":               { fr: "Propriétés",               ar: "الخصائص" },
  "Alternate forms":          { fr: "Autres formes",            ar: "صيغ بديلة" },
  "Visual representation":    { fr: "Représentation visuelle",  ar: "التمثيل المرئي" },
  "Roots":                    { fr: "Racines",                  ar: "الجذور" },
  "Vertex":                   { fr: "Sommet",                   ar: "الرأس" },
};

function translatePodTitle(title: string, locale: Locale): string {
  if (locale === "en") return title;
  return POD_TITLE_I18N[title]?.[locale] ?? title;
}

function normalizeLocale(input: unknown): Locale {
  const v = typeof input === "string" ? input.toLowerCase().slice(0, 2) : "";
  return v === "fr" || v === "ar" ? (v as Locale) : "en";
}

// ─── Input cleaning ───────────────────────────────────────────────

/** Pull the actual math out of a tutor-style wrapper. */
function extractProblem(raw: string): string {
  const trimmed = raw.trim();
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
  return /[=+\-*/^()<>≤≥]/.test(s) || /\b(?:x|y|z|sqrt|pi|sin|cos|tan|log|ln|d\/d[xyt])\b/.test(s);
}

// ─── Wolfram formatters ───────────────────────────────────────────

/** Convert the raw Wolfram LLM API text into clean Markdown. Section
 *  headers are translated per locale; the verification footer / horizontal
 *  rule / Markdown links are dropped so nothing leaks as raw `*` or `---`. */
function formatWolframLLMText(raw: string, locale: Locale): string {
  const L = LABELS[locale];
  const out: string[] = [`### ${L.solution}`, ``];

  for (const lineRaw of raw.split("\n")) {
    const line = lineRaw.trimEnd();
    if (!line.trim()) { out.push(""); continue; }

    const imgMatch = line.match(/^image:\s*(https?:\/\/\S+)/i);
    if (imgMatch) { out.push(`![](${imgMatch[1]})`); continue; }

    // Drop the "Wolfram|Alpha website result..." URL — UI is cleaner without it.
    if (/^Wolfram\|Alpha/i.test(line)) continue;

    // Section header like "Result:" or "Solutions:" — translate + bold.
    const headerMatch = line.match(/^([A-Z][A-Za-z ]+):$/);
    if (headerMatch) {
      out.push(`**${translatePodTitle(headerMatch[1], locale)}:**`);
      continue;
    }

    out.push(isMathLine(line) ? `$$${line.trim()}$$` : line);
  }
  return out.join("\n");
}

/** Wolfram LLM API (CAG key). */
async function tryWolframLLM(problem: string, locale: Locale): Promise<string | null> {
  if (!CAG_KEY) return null;
  const encoded = encodeURIComponent(cleanForWolfram(problem));
  const url = `https://www.wolframalpha.com/api/v1/llm-api?input=${encoded}&appid=${CAG_KEY}&maxchars=4000`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return formatWolframLLMText(text, locale);
  } catch {
    return null;
  }
}

/** AgentOne Full Results fallback. Pods → Markdown sections, translated. */
async function tryWolframFullResults(problem: string, locale: Locale): Promise<string | null> {
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

    const L = LABELS[locale];
    const out: string[] = [`### ${L.solution}`, ``];
    for (const pod of pods) {
      const title = pod.title || "";
      const subpods = pod.subpods || [];
      const texts: string[] = subpods.map((sp: any) => (sp.plaintext || "").trim()).filter(Boolean);
      const imgs: string[] = subpods.map((sp: any) => sp.img?.src).filter(Boolean);
      if (!texts.length && !imgs.length) continue;
      out.push(`**${translatePodTitle(title, locale)}:**`);
      for (const t of texts) out.push(isMathLine(t) ? `$$${t}$$` : t);
      for (const src of imgs) out.push(`![](${src})`);
      out.push("");
    }
    return out.join("\n");
  } catch {
    return null;
  }
}

// ─── Word-problem detection + GPT-4o fallback ─────────────────────

function isWordProblem(input: string): boolean {
  const stripped = input
    .replace(/\$\$?[^$]*\$\$?/g, " ")
    .replace(/[0-9+\-*/^=()<>≤≥%!,;:]+/g, " ");
  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length >= 2 && /^[A-Za-zÀ-ÿ']+$/.test(w));
  return words.length >= 8;
}

async function tryOpenAIWordProblem(
  problem: string,
  locale: Locale,
): Promise<{ body: string } | { error: string }> {
  const rawKey = process.env.OPENAI_API_KEY;
  const key = rawKey ? rawKey.trim() : "";
  if (!key) {
    const visible = Object.keys(process.env)
      .filter((k) => /openai|gpt/i.test(k))
      .map((k) => `"${k}"`);
    const hint = visible.length
      ? ` Visible OpenAI-related env vars in this deployment: ${visible.join(", ")} — did you name it differently?`
      : " No OPENAI_* env var is visible to the function at all. Re-check Vercel → Settings → Environment Variables, confirm Production is ticked, then trigger a fresh deploy from the Deployments tab (not just \"Redeploy\" with cached build).";
    return { error: `OPENAI_API_KEY env var is missing or empty in this deployment.${hint}` };
  }
  if (!/^sk-/.test(key)) {
    return { error: `OPENAI_API_KEY does not start with "sk-" (got length ${key.length}) — wrong value pasted?` };
  }

  const L = LABELS[locale];
  const langInstruction = `Answer entirely in ${LANG_NAME[locale]}. Every label, every word, every explanation — in ${LANG_NAME[locale]}. Translate the section labels below to that language and use them verbatim.`;

  const system = `You are a math tutor solving a WORD PROBLEM. ${langInstruction}

Return CLEAN Markdown with this exact structure (no preamble, no horizontal rules, no footers):

### ${L.solution}

**${L.understandingProblem}:**
(one or two sentences restating what's being asked)

**${L.setup}:**
(define each variable on its own line and write the governing equations, every math expression wrapped in $$...$$)

**${L.steps}:**
1. ...
2. ...
3. ...

**${L.answer}:** $$<final numeric or symbolic answer>$$

**${L.check}:** (one short sentence verifying the result makes sense)

Strict formatting rules:
- Output ONLY the Markdown body. No code fences, no preamble, no closing horizontal rule, no italic footer.
- Wrap EVERY math expression in $$...$$. Never write raw \`*\`, \`_\`, \`---\` or inline asterisks.
- Use only these Markdown features: \`###\` heading, \`**bold:**\`, numbered lists \`1.\`, \`$$...$$\` math.
- No Markdown links like [text](url). If you must reference a source, write the URL bare.
- Be precise, verify by substitution / unit check, keep prose tight.`;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `OpenAI request failed before a response: ${msg}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `OpenAI returned HTTP ${res.status}: ${body.slice(0, 400) || res.statusText}` };
  }

  let data: unknown;
  try { data = await res.json(); }
  catch { return { error: "OpenAI returned a non-JSON body" }; }
  const text: string | undefined = (data as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) return { error: "OpenAI returned an empty completion" };

  // Strip any closing horizontal rule / italic footer the model added
  // despite the system rules. This is a belt-and-braces guard against
  // raw `---` or `*…*` leaking into the chat bubble.
  const cleaned = text
    .trim()
    .replace(/\n+---+\s*$/, "")          // trailing horizontal rule
    .replace(/\n+\*[^*\n]+\*\s*$/, "");   // trailing single-line italic footer

  return { body: cleaned };
}

// ─── Streaming ────────────────────────────────────────────────────

function streamText(body: string): Response {
  const encoder = new TextEncoder();
  const lines = body.split("\n");
  const stream = new ReadableStream({
    async start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
        await new Promise((r) => setTimeout(r, 8));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

// ─── Handler ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { question?: string; subject?: string; locale?: string };
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

  const locale = normalizeLocale(body.locale);
  const problem = extractProblem(question);
  const wordProblem = isWordProblem(problem);

  // 1) Wolfram LLM API (CAG) — rich tutor-style text.
  let formatted = await tryWolframLLM(problem, locale);
  // 2) AgentOne Full Results pods.
  if (!formatted) formatted = await tryWolframFullResults(problem, locale);
  // 3) Word-problem fallback — GPT-4o (only for natural-language problems).
  let gptError: string | null = null;
  if (!formatted && wordProblem) {
    const gpt = await tryOpenAIWordProblem(problem, locale);
    if ("body" in gpt) formatted = gpt.body;
    else gptError = gpt.error;
  }

  if (!formatted) {
    const message = wordProblem
      ? `Could not solve this word problem. ${gptError ?? "Wolfram parsed nothing and the GPT-4o fallback was not invoked."}`
      : "Wolfram Alpha could not produce an answer for this query.";
    console.error("[/api/math/claude] failed:", { wordProblem, gptError, locale });
    return NextResponse.json({ error: message }, { status: 422 });
  }
  return streamText(formatted);
}
