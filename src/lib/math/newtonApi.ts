// Wrapper around Newton API (https://newton.now.sh/api/v2/{operation}/{expression})

export type NewtonOperation =
  | "simplify"
  | "factor"
  | "derive"
  | "integrate"
  | "zeroes"
  | "tangent"
  | "area"
  | "cos"
  | "sin"
  | "tan"
  | "arccos"
  | "arcsin"
  | "arctan"
  | "abs"
  | "log";

export interface NewtonResult {
  operation: string;
  expression: string;
  result: string;
}

/**
 * Encode an expression for Newton API.
 * Newton uses the URL path, so we need to URL-encode special characters.
 * The API expects ** for exponentiation, so convert ^ to **.
 */
function encodeExpression(expr: string): string {
  let encoded = expr.trim();

  // Newton API uses ** for exponentiation instead of ^
  encoded = encoded.replace(/\^/g, "**");

  // URL encode the expression for path segment usage
  encoded = encodeURIComponent(encoded);

  return encoded;
}

/**
 * Call the Newton API with the given operation and expression.
 * Returns null if the request fails or times out (5 second limit).
 */
export async function callNewton(
  operation: NewtonOperation,
  expression: string
): Promise<NewtonResult | null> {
  const encoded = encodeExpression(expression);
  const url = `https://newton.now.sh/api/v2/${operation}/${encoded}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as NewtonResult;

    // Newton returns "error" in the result field on invalid input
    if (
      !data.result ||
      data.result === "error" ||
      data.result.toLowerCase().includes("error")
    ) {
      return null;
    }

    return {
      operation: data.operation,
      expression: data.expression,
      result: data.result,
    };
  } catch {
    // Network error, timeout, or JSON parse failure
    return null;
  }
}

// ─── Convenience functions ──────────────────────────────────────

export async function simplify(expr: string): Promise<string | null> {
  const result = await callNewton("simplify", expr);
  return result?.result ?? null;
}

export async function factor(expr: string): Promise<string | null> {
  const result = await callNewton("factor", expr);
  return result?.result ?? null;
}

export async function derive(expr: string): Promise<string | null> {
  const result = await callNewton("derive", expr);
  return result?.result ?? null;
}

export async function integrate(expr: string): Promise<string | null> {
  const result = await callNewton("integrate", expr);
  return result?.result ?? null;
}

export async function findZeroes(expr: string): Promise<string | null> {
  const result = await callNewton("zeroes", expr);
  return result?.result ?? null;
}
