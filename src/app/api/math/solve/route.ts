import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a precise mathematical solver. Solve the given equation or expression step by step.

CRITICAL: Your answer must be mathematically CORRECT. Double-check by substituting back.

Return your response as a JSON object with this exact structure:
{
  "originalEquation": "EXACT user input, unchanged",
  "equationType": "linear|quadratic|transcendental|calculus|simplification|etc",
  "variable": "x",
  "steps": [
    {
      "stepNumber": 1,
      "description": "What you're doing in this step",
      "afterEquation": "The equation after this step"
    }
  ],
  "solution": { "x": "1.234" },
  "verification": "Substituting x=1.234 into original: LHS = ..., RHS = ... ✓"
}

FORMATTING RULES (CRITICAL — follow exactly):
- "originalEquation" must be the EXACT input the user typed. Do NOT reformat, add parentheses, or change notation.
- In "afterEquation", use CLEAN compact math notation:
  - Write fractions as "6/5" NOT "(6) / (5)" or "( 6 ) / ( 5 )"
  - Write multiplication as "4·7" or "4(7)" NOT "4 * 7" or "4 × 7"
  - Do NOT add unnecessary parentheses around single numbers
  - Do NOT add spaces around division signs
  - Keep notation consistent across ALL steps
- For transcendental equations, use numerical methods and state the method.
- Always provide decimal answers to 6 significant figures.
- The "steps" array must show every algebraic manipulation.
- If multiple solutions exist, list them all.
- ONLY return valid JSON. No markdown, no explanation outside the JSON.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  let body: { equation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { equation } = body;
  if (!equation || typeof equation !== "string") {
    return NextResponse.json({ error: "An 'equation' field is required." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Solve this equation. IMPORTANT: The "originalEquation" in your response must be EXACTLY "${equation}" — do not reformat it. In each step's "afterEquation", use the same fraction notation style (e.g. write "6/5" not "(6)/(5)"). Equation: ${equation}` },
        ],
        max_tokens: 2048,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMsg = `OpenAI API error (${response.status})`;
      try { const p = JSON.parse(errorText); if (p.error?.message) errorMsg = p.error.message; } catch {}
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(content);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response", raw: content }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Solve failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
