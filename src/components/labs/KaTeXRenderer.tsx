"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface KaTeXRendererProps {
  math: string;
  display?: boolean;
  className?: string;
  errorColor?: string;
}

// ─── Render a single LaTeX string ────────────────────────────────
function renderLatex(latex: string, displayMode: boolean, errorColor: string): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor,
      trust: true,
      strict: false,
      macros: {
        "\\implies": "\\Rightarrow",
      },
    });
  } catch {
    return `<span style="color:${errorColor}">${escapeHtml(latex)}</span>`;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Parse mixed content with ALL delimiter formats ──────────────
// Supports: \[...\] (display), \(...\) (inline), $$...$$ (display), $...$ (inline)
// Also handles: ### headers, **bold**, numbered steps
function parseMixedContent(input: string, errorColor: string): string {
  // Normalize line endings
  let text = input.replace(/\r\n/g, "\n");

  // Step 0: Remove GPT's duplicate plaintext renderings after LaTeX expressions.
  // GPT often outputs: "$\frac{dx}{dt}$\ndt\ndx\n​\n =3x−4y" — the second part is garbage.
  // Pattern: after a $...$ or $$...$$ block, remove lines that are just fragments
  // of the same expression (single chars, subscript fragments, short operator fragments).

  // Remove Unicode zero-width characters and isolated fragments
  text = text.replace(/\u200B/g, ""); // zero-width space
  text = text.replace(/\u200E/g, ""); // left-to-right mark
  text = text.replace(/\u200F/g, ""); // right-to-left mark
  text = text.replace(/​/g, "");      // zero-width space (literal)

  // Remove duplicate plaintext after inline math: $...$\nfragment lines
  // These fragments are short lines (1-3 chars) that are remnants of LaTeX rendering
  text = text.replace(/(\$[^$\n]+\$)\n((?:[ \t]*[a-zA-Z0-9=+\-−×÷·()^_{}\\,.<>≈≠≤≥∓±√∫∑∏]{1,4}[ \t]*\n){2,})/g, "$1\n");

  // Remove blocks of single-character lines that follow math (GPT's plaintext decomposition)
  // Pattern: 3+ consecutive lines where each line is just 1-5 chars (letters, digits, operators)
  text = text.replace(/\n((?:[ \t]*[a-zA-Z0-9=+\-−×÷·()^_{}\\,.<>≈≠≤≥∓±√∫∑∏!|/]{1,5}[ \t]*\n){3,})/g, "\n");

  // Remove orphaned subscript/superscript fragments like "​\n =3x−4y" or "1\n​\n−4v"
  text = text.replace(/\n[ \t]*​[ \t]*\n/g, "\n");

  // Clean up excessive blank lines (more than 2 in a row)
  text = text.replace(/\n{4,}/g, "\n\n\n");

  // Step 1: Replace \[...\] with $$...$$ for uniform handling
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => `$$${latex}$$`);

  // Step 2: Replace \(...\) with $...$ for uniform handling
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => `$${latex}$`);

  // Step 3: Split into lines for block-level formatting
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Display math: handle all $$ patterns
    const trimmedLine = line.trim();

    // Case 1: Line is just "$$" — opening delimiter, collect until closing "$$"
    if (trimmedLine === "$$") {
      let mathBlock = "";
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") {
        mathBlock += (mathBlock ? "\n" : "") + lines[i];
        i++;
      }
      if (i < lines.length) i++; // skip closing $$
      if (mathBlock.trim()) {
        result.push(`<div class="katex-display-block">${renderLatex(mathBlock.trim(), true, errorColor)}</div>`);
      }
      continue;
    }

    // Case 2: Line starts with $$ but doesn't end with $$ — multi-line display math
    if (trimmedLine.startsWith("$$") && !trimmedLine.endsWith("$$")) {
      let mathBlock = trimmedLine.slice(2);
      i++;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) {
        mathBlock += "\n" + lines[i];
        i++;
      }
      if (i < lines.length) {
        const closingLine = lines[i].trim();
        mathBlock += "\n" + (closingLine === "$$" ? "" : closingLine.slice(0, -2));
        i++;
      }
      if (mathBlock.trim()) {
        result.push(`<div class="katex-display-block">${renderLatex(mathBlock.trim(), true, errorColor)}</div>`);
      }
      continue;
    }

    // Case 3: Single-line $$...$$
    if (trimmedLine.startsWith("$$") && trimmedLine.endsWith("$$") && trimmedLine.length > 4) {
      const latex = trimmedLine.slice(2, -2).trim();
      if (latex) {
        result.push(`<div class="katex-display-block">${renderLatex(latex, true, errorColor)}</div>`);
      }
      i++;
      continue;
    }

    // Case 4: Orphaned $$ on its own — skip it (stray delimiter)
    if (trimmedLine === "$$") {
      i++;
      continue;
    }

    // Markdown headers: ### Title, ## Title, # Title
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = processInlineMath(headerMatch[2], errorColor);
      const sizes: Record<number, string> = {
        1: "text-xl font-bold mt-6 mb-3",
        2: "text-lg font-bold mt-5 mb-2",
        3: "text-base font-semibold mt-4 mb-2 text-blue-400",
        4: "text-sm font-semibold mt-3 mb-1.5 text-slate-400",
      };
      result.push(`<div class="${sizes[level] || sizes[3]}">${headerText}</div>`);
      i++;
      continue;
    }

    // Horizontal rule: ---
    if (line.trim() === "---" || line.trim() === "***") {
      result.push('<hr class="border-white/10 my-3" />');
      i++;
      continue;
    }

    // Bold text: **text**
    // Numbered steps: 1. text, 2. text
    // Regular paragraph
    if (line.trim()) {
      const processed = processInlineMath(line, errorColor);
      result.push(`<p class="my-1.5 leading-relaxed">${processed}</p>`);
    } else {
      // Empty line → small spacing
      result.push('<div class="h-2"></div>');
    }

    i++;
  }

  // Final cleanup: remove any remaining visible $$ or stray $ delimiters
  let output = result.join("\n");
  output = output.replace(/\$\$/g, "");
  // Remove stray $ that aren't inside HTML tags (be careful not to strip $ inside rendered katex)
  output = output.replace(/(?<![a-zA-Z0-9=\\])\$(?![a-zA-Z0-9\\])/g, "");
  return output;
}

// ─── Process inline math ($...$) and markdown formatting within a line ──
function processInlineMath(line: string, errorColor: string): string {
  // Replace **bold** with <strong>
  let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Replace `code` with styled code
  processed = processed.replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono">$1</code>');

  // Replace inline math $...$
  processed = processed.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    return renderLatex(latex.trim(), false, errorColor);
  });

  // Replace #### subheaders within lines
  processed = processed.replace(/^####\s+(.+)$/, '<span class="font-semibold text-slate-300">$1</span>');

  return processed;
}

// ─── Component ───────────────────────────────────────────────────
export default function KaTeXRenderer({
  math,
  display = false,
  className = "",
  errorColor = "#ff6b6b",
}: KaTeXRendererProps) {
  const html = useMemo(() => {
    if (!math) return "";

    // Check if the input contains ANY math delimiters or markdown
    const hasMixed = /\$|\\\[|\\\(|^#{1,4}\s/m.test(math);

    if (hasMixed) {
      return parseMixedContent(math, errorColor);
    }

    // Pure LaTeX string (no delimiters) — render directly
    return renderLatex(math, display, errorColor);
  }, [math, display, errorColor]);

  if (!math) return null;

  return (
    <div
      className={`katex-renderer ${className}`}
      style={{ lineHeight: 1.7 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
