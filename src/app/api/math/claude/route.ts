import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are an expert mathematics tutor. ACCURACY IS YOUR #1 PRIORITY.

FORMATTING RULES — FOLLOW EXACTLY:
1. Use $...$ for ALL inline math. Use $$...$$ for ALL display math.
2. NEVER use \\( \\) or \\[ \\] delimiters.
3. NEVER duplicate an expression. If you write $x^2 = 4$, do NOT also write "x² = 4" or "x^2 = 4" as plain text next to it. The LaTeX version is the ONLY version.
4. Write display math as a SINGLE LINE: $$\\frac{dx}{dt} = 3x - 4y$$
5. For matrices on one line: $$A = \\begin{bmatrix} 3 & -4 \\\\ 2 & -3 \\end{bmatrix}$$
6. Use ### for step headers.
7. Use **bold** for emphasis.

EXAMPLE OF CORRECT OUTPUT:
"Substituting $\\lambda = 1$ into $A - \\lambda I$, we get:

$$A - I = \\begin{bmatrix} 2 & -4 \\\\ 2 & -4 \\end{bmatrix}$$

From the first row, $2v_1 - 4v_2 = 0$, so $v_1 = 2v_2$."

EXAMPLE OF WRONG OUTPUT (NEVER do this):
"Substituting $\\lambda = 1$ λ=1 into $A - \\lambda I$ A−λI, we get..."
(This is wrong because each expression appears twice.)

SOLVING RULES:
- Show every step. Number them clearly.
- ALWAYS verify by substituting back.
- Add a ### Verification section at the end.
- Be educational and encouraging.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Please add it to your environment variables." },
      { status: 500 },
    );
  }

  let body: { question?: string; subject?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { question, subject } = body;
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "A non-empty 'question' field is required." }, { status: 400 });
  }

  const userMessage = subject ? `Subject: ${subject}\n\nQuestion: ${question}` : question;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4096,
        temperature: 0.1, // Low temperature for math accuracy
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMsg = `OpenAI API error (${response.status})`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch { /* use default */ }
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    // Transform OpenAI SSE stream into plain text stream
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No response stream" }, { status: 500 });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch { /* skip malformed chunks */ }
            }
          }
          controller.close();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Stream interrupted";
          controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
