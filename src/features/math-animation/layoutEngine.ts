import type { MathToken, LayoutToken } from "./types";

const FONT_FAMILY = "'Montserrat', system-ui, sans-serif";
const TOKEN_PADDING = 8;
const EQUALS_PADDING = 14;
const MIN_FONT_SIZE = 10;
const MAX_WIDTH_RATIO = 0.85;

// ---------------------------------------------------------------------------
// Hidden canvas singleton for text measurement
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d")!;
  }
  return measureCtx;
}

/**
 * Measure the rendered width of a string at a given font size
 * using the hidden canvas context.
 */
export function measureText(text: string, fontSize: number): number {
  const ctx = getMeasureCtx();
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
  return ctx.measureText(text).width;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MeasuredToken {
  token: MathToken;
  textWidth: number;
  paddedWidth: number;
}

/**
 * Measure every token and return total width plus individual measurements.
 */
function measureAllTokens(
  tokens: MathToken[],
  fontSize: number
): { measured: MeasuredToken[]; totalWidth: number } {
  let totalWidth = 0;
  const measured: MeasuredToken[] = tokens.map((token) => {
    const textWidth = measureText(token.text, fontSize);
    const padding = token.side === "equals" ? EQUALS_PADDING : TOKEN_PADDING;
    const paddedWidth = textWidth + padding * 2;
    totalWidth += paddedWidth;
    return { token, textWidth, paddedWidth };
  });
  return { measured, totalWidth };
}

/**
 * Find the largest font size (starting from `startSize`, decreasing by 2px
 * each iteration) such that the total token width fits within the allowed width.
 * Returns at least MIN_FONT_SIZE.
 */
function fitFontSize(
  tokens: MathToken[],
  startSize: number,
  allowedWidth: number
): number {
  let fontSize = startSize;

  while (fontSize > MIN_FONT_SIZE) {
    const { totalWidth } = measureAllTokens(tokens, fontSize);
    if (totalWidth <= allowedWidth) return fontSize;
    fontSize -= 2;
  }

  return MIN_FONT_SIZE;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Position an array of MathToken objects into a centered horizontal layout.
 *
 * Tokens are laid out left-to-right: left-side terms, then the equals sign,
 * then right-side terms. The entire row is centered around `centerX`.
 *
 * If the natural width exceeds `maxWidth * 0.85`, the font size is reduced
 * (down to a minimum of 10 px) until everything fits.
 *
 * @param tokens   - Flat array of MathTokens (left + equals + right)
 * @param centerX  - Horizontal center point of the layout (px)
 * @param baseY    - Vertical baseline position for tokens (px)
 * @param fontSize - Starting font size (px)
 * @param maxWidth - Maximum available width (px, e.g. SVG viewBox width)
 * @returns LayoutToken[] with x, y, width, and final fontSize filled in
 */
export function layoutTokens(
  tokens: MathToken[],
  centerX: number,
  baseY: number,
  fontSize: number,
  maxWidth: number
): LayoutToken[] {
  const allowedWidth = maxWidth * MAX_WIDTH_RATIO;

  // Determine the best-fit font size
  const finalFontSize = fitFontSize(tokens, fontSize, allowedWidth);

  // Measure at the final size
  const { measured, totalWidth } = measureAllTokens(tokens, finalFontSize);

  // Starting x so that the row is centered at centerX
  let cursorX = centerX - totalWidth / 2;

  const layoutTokens: LayoutToken[] = measured.map(
    ({ token, textWidth, paddedWidth }) => {
      const padding = token.side === "equals" ? EQUALS_PADDING : TOKEN_PADDING;
      // The token's x is the center of its padded area
      const x = cursorX + padding + textWidth / 2;
      cursorX += paddedWidth;

      return {
        ...token,
        x,
        y: baseY,
        width: textWidth,
        fontSize: finalFontSize,
      };
    }
  );

  return layoutTokens;
}
