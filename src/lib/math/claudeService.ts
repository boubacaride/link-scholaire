export interface ClaudeResponse {
  text: string;
  error?: string;
}

/**
 * Non-streaming call to the Claude math API route.
 * Collects the full response and returns it as a single string.
 */
export async function askClaude(
  question: string,
  subject?: string,
): Promise<ClaudeResponse> {
  try {
    const response = await fetch("/api/math/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, subject }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message =
        errorData?.error ||
        `Request failed with status ${response.status}`;
      return { text: "", error: message };
    }

    const text = await response.text();
    return { text };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to connect to the server.";
    return { text: "", error: message };
  }
}

/**
 * Streaming call to the Claude math API route.
 * Delivers text incrementally through the onChunk callback.
 */
export async function askClaudeStreaming(
  question: string,
  subject: string | undefined,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const response = await fetch("/api/math/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, subject }),
    });

    if (!response.ok) {
      // Try to read as JSON error first, then as text
      const text = await response.text().catch(() => "");
      let message = `Request failed with status ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) message = parsed.error;
      } catch {
        if (text) message = text;
      }
      onError(message);
      return;
    }

    // Check content type — if JSON, it's an error response not a stream
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => ({ error: "Unknown error" }));
      onError(data.error || "Unknown error");
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError("Unable to read response stream.");
      return;
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) { onDone(); return; }
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) onChunk(chunk);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to connect to the server.";
    onError(message);
  }
}
