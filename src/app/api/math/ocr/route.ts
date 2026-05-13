import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { image } = body;
  if (!image || typeof image !== "string") {
    return NextResponse.json({ error: "A base64 'image' field is required." }, { status: 400 });
  }

  let imageUrl = image;
  if (!imageUrl.startsWith("data:")) {
    imageUrl = `data:image/png;base64,${imageUrl}`;
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
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the mathematical expression from this image. Return ONLY the math expression in plain text notation (use ^ for exponents, sqrt() for square roots, etc.). No explanation, no words — just the math expression.",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 256,
        temperature: 0,
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

    const data = await response.json();
    const expression = data.choices?.[0]?.message?.content?.trim() || "";

    if (!expression) {
      return NextResponse.json({ error: "Could not extract math from the image." }, { status: 422 });
    }

    return NextResponse.json({ expression });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "OCR failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
