"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SolutionStep } from "@/lib/equationSolver";

interface Props {
  steps: SolutionStep[];
  isPlaying: boolean;
  playbackSpeed: number;
  currentStep: number;
  onStepChange: (step: number) => void;
}

// ─── Token-level equation parser ───────────────────────────────
interface Token {
  id: string;
  text: string;
  x: number;       // x position relative to center
  y: number;       // y offset
  width: number;
  isOperator: boolean;
  side: "left" | "right";
}

function tokenizeEquation(eq: string): { text: string; isOperator: boolean }[] {
  const tokens: { text: string; isOperator: boolean }[] = [];
  let i = 0;
  const s = eq.replace(/\s+/g, "");

  while (i < s.length) {
    const ch = s[i];

    // Equals sign
    if (ch === "=") {
      tokens.push({ text: "=", isOperator: true });
      i++;
    }
    // Sign + term
    else if (ch === "+" || ch === "-" || ch === "−") {
      const sign = ch === "−" ? "−" : ch;
      let term = sign;
      i++;
      // Collect the rest of the term
      while (i < s.length && s[i] !== "+" && s[i] !== "-" && s[i] !== "−" && s[i] !== "=") {
        term += s[i];
        i++;
      }
      tokens.push({ text: term, isOperator: false });
    }
    // First term (no leading sign)
    else {
      let term = "";
      while (i < s.length && s[i] !== "+" && s[i] !== "-" && s[i] !== "−" && s[i] !== "=") {
        term += s[i];
        i++;
      }
      if (term) tokens.push({ text: term, isOperator: false });
    }
  }
  return tokens;
}

// Draw text wrapped to maxWidth, centered
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  const lineHeight = 14;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}

function layoutTokens(
  ctx: CanvasRenderingContext2D,
  eq: string,
  centerX: number,
  baseY: number,
  font: string,
  maxWidth?: number
): Token[] {
  ctx.save();
  ctx.font = font;

  const rawTokens = tokenizeEquation(eq);
  const layoutToks: Token[] = [];

  // Find equals position
  const eqIdx = rawTokens.findIndex((t) => t.text === "=");
  const leftToks = eqIdx >= 0 ? rawTokens.slice(0, eqIdx) : rawTokens;
  const rightToks = eqIdx >= 0 ? rawTokens.slice(eqIdx + 1) : [];

  // Measure widths
  const padding = 8;
  const leftWidths = leftToks.map((t) => ctx.measureText(t.text).width + padding);
  const rightWidths = rightToks.map((t) => ctx.measureText(t.text).width + padding);
  const equalsWidth = ctx.measureText(" = ").width;

  const leftTotal = leftWidths.reduce((a, b) => a + b, 0);
  const rightTotal = rightWidths.reduce((a, b) => a + b, 0);

  // Layout: left terms + equals + right terms, centered around centerX
  let totalWidth = leftTotal + equalsWidth + rightTotal;

  // If text overflows, scale down font to fit
  const availWidth = maxWidth || 9999;
  if (totalWidth > availWidth * 0.9) {
    ctx.restore();
    // Extract font size and reduce it
    const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
    if (sizeMatch) {
      const currentSize = parseFloat(sizeMatch[1]);
      const scale = (availWidth * 0.85) / totalWidth;
      const newSize = Math.max(10, currentSize * scale);
      const newFont = font.replace(/(\d+(?:\.\d+)?)px/, `${newSize}px`);
      return layoutTokens(ctx, eq, centerX, baseY, newFont, maxWidth);
    }
  }

  let cursor = centerX - totalWidth / 2;

  // Left side
  leftToks.forEach((t, i) => {
    const w = leftWidths[i];
    layoutToks.push({
      id: `L${i}_${t.text}`,
      text: t.text,
      x: cursor + w / 2,
      y: baseY,
      width: w,
      isOperator: t.isOperator,
      side: "left",
    });
    cursor += w;
  });

  // Equals
  if (eqIdx >= 0) {
    layoutToks.push({
      id: "EQ",
      text: "=",
      x: cursor + equalsWidth / 2,
      y: baseY,
      width: equalsWidth,
      isOperator: true,
      side: "left",
    });
    cursor += equalsWidth;
  }

  // Right side
  rightToks.forEach((t, i) => {
    const w = rightWidths[i];
    layoutToks.push({
      id: `R${i}_${t.text}`,
      text: t.text,
      x: cursor + w / 2,
      y: baseY,
      width: w,
      isOperator: t.isOperator,
      side: "right",
    });
    cursor += w;
  });

  ctx.restore();
  return layoutToks;
}

export default function VisualizationEngine({
  steps,
  isPlaying,
  playbackSpeed,
  currentStep,
  onStepChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const progressRef = useRef(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    setCompletedSteps([]);
    progressRef.current = 0;
  }, [steps]);

  const renderStaticEquation = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      eq: string,
      centerX: number,
      y: number,
      font: string,
      color: string,
      alpha: number = 1,
      glow: boolean = false
    ) => {
      const tokens = layoutTokens(ctx, eq, centerX, y, font, centerX * 2);
      ctx.save();
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = alpha;
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
      }
      ctx.fillStyle = color;
      tokens.forEach((tok) => {
        ctx.fillText(tok.text, tok.x, tok.y);
      });
      ctx.restore();
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let elapsed = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = (now - lastTime) * playbackSpeed;
      lastTime = now;
      // Font placeholder — will be set after canvasW is calculated
      let font = "bold 20px 'Montserrat', system-ui, sans-serif";

      if (isPlaying && currentStep < steps.length) {
        elapsed += dt;
        const step = steps[currentStep];
        progressRef.current = Math.min(elapsed / step.duration, 1);

        if (elapsed >= step.duration) {
          elapsed = 0;
          setCompletedSteps((prev) =>
            prev.includes(currentStep) ? prev : [...prev, currentStep]
          );
          if (currentStep + 1 < steps.length) {
            onStepChange(currentStep + 1);
          }
        }
      }

      // ── Background ─────────────────────────────────────────
      const canvasW = canvas.width / (window.devicePixelRatio || 1);
      const canvasH = canvas.height / (window.devicePixelRatio || 1);

      // Responsive font sizes based on canvas width
      const baseFontSize = Math.min(22, Math.max(13, canvasW * 0.028));
      font = `bold ${baseFontSize}px 'Montserrat', system-ui, sans-serif`;

      ctx.clearRect(0, 0, canvasW, canvasH);
      const bg = ctx.createLinearGradient(0, 0, 0, canvasH);
      bg.addColorStop(0, "#0f0c29");
      bg.addColorStop(0.5, "#1a1545");
      bg.addColorStop(1, "#24243e");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < canvasW; gx += 50) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, canvasH);
        ctx.stroke();
      }
      for (let gy = 0; gy < canvasH; gy += 50) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvasW, gy);
        ctx.stroke();
      }

      const centerX = canvasW / 2;
      const stepGap = Math.min(130, canvasH / Math.max(4, steps.length + 1));
      // Auto-scroll: keep current step visible in the viewport
      const totalHeight = steps.length * stepGap + 160;
      const viewportH = canvasH;
      const idealCurrentY = 80 + currentStep * stepGap;
      const scrollOffset = totalHeight > viewportH
        ? Math.max(0, Math.min(idealCurrentY - viewportH * 0.4, totalHeight - viewportH))
        : 0;
      const startY = 80 - scrollOffset;

      // ── Completed steps (static) ───────────────────────────
      completedSteps.forEach((sIdx) => {
        const step = steps[sIdx];
        if (!step) return;
        const y = startY + sIdx * stepGap;

        if (step.description && step.operation !== "display") {
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.font = `${Math.min(11, Math.max(9, canvasW * 0.014))}px 'Inter', system-ui, sans-serif`;
          ctx.fillStyle = "#a29bfe";
          ctx.textAlign = "center";
          wrapText(ctx, step.description, centerX, y - 26, canvasW * 0.85);
          ctx.restore();
        }

        const isSolution = step.operation === "solution";
        renderStaticEquation(
          ctx,
          step.afterEquation,
          centerX,
          y,
          font,
          isSolution ? "#16c79a" : "#ffffff",
          1,
          isSolution
        );

        // Arrow to next
        if (sIdx < steps.length - 1 && !isSolution) {
          const ay = y + 22;
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(centerX, ay);
          ctx.lineTo(centerX, y + stepGap - 35);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(centerX - 5, y + stepGap - 41);
          ctx.lineTo(centerX, y + stepGap - 35);
          ctx.lineTo(centerX + 5, y + stepGap - 41);
          ctx.stroke();
          ctx.restore();
        }
      });

      // ── Animating current step ─────────────────────────────
      if (currentStep < steps.length && !completedSteps.includes(currentStep)) {
        const step = steps[currentStep];
        const y = startY + currentStep * stepGap;
        const progress = progressRef.current;

        // Description fade in
        if (step.description && step.operation !== "display") {
          ctx.save();
          ctx.globalAlpha = easeOut(Math.min(progress * 3, 1)) * 0.7;
          ctx.font = `${Math.min(11, Math.max(9, canvasW * 0.014))}px 'Inter', system-ui, sans-serif`;
          ctx.fillStyle = "#a29bfe";
          ctx.textAlign = "center";
          wrapText(ctx, step.description, centerX, y - 26, canvasW * 0.85);
          ctx.restore();
        }

        // No movements: simple fade in
        if (step.termMovements.length === 0) {
          renderStaticEquation(
            ctx,
            step.afterEquation,
            centerX,
            y,
            font,
            step.operation === "solution" ? "#16c79a" : "#ffffff",
            easeOut(Math.min(progress * 1.5, 1)),
            step.operation === "solution"
          );
        } else {
          // ── REAL TOKEN ANIMATION ────────────────────────────
          const beforeTokens = layoutTokens(ctx, step.beforeEquation, centerX, y, font, canvasW);
          const afterTokens = layoutTokens(ctx, step.afterEquation, centerX, y, font, canvasW);
          const animPhase = easeInOut(progress);

          const normalize = (s: string) =>
            s.replace(/−/g, "-").replace(/\s+/g, "").trim();

          // ── 1. Figure out which before-tokens are being moved ──
          // Map: beforeToken → movement
          const beforeMovementMap = new Map<number, typeof step.termMovements[0]>();
          step.termMovements.forEach((m) => {
            const wanted = normalize(m.term);
            for (let i = 0; i < beforeTokens.length; i++) {
              if (beforeTokens[i].isOperator) continue;
              if (beforeMovementMap.has(i)) continue;
              if (normalize(beforeTokens[i].text) === wanted) {
                beforeMovementMap.set(i, m);
                break;
              }
            }
          });

          // Map: afterToken index → is target of movement
          const afterIsTarget = new Set<number>();
          step.termMovements.forEach((m) => {
            const wanted = normalize(m.resultingTerm);
            for (let i = 0; i < afterTokens.length; i++) {
              if (afterTokens[i].isOperator) continue;
              if (normalize(afterTokens[i].text) === wanted) {
                afterIsTarget.add(i);
              }
            }
          });

          // ── 2. Render stationary tokens ──
          // A token is stationary if it exists (by text) in BOTH before and after
          // AND it's not being explicitly moved.
          const renderedAfterIdx = new Set<number>();
          afterTokens.forEach((afterTok, aIdx) => {
            // Equals always stays
            if (afterTok.isOperator && afterTok.text === "=") {
              ctx.save();
              ctx.font = font;
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("=", afterTok.x, afterTok.y);
              ctx.restore();
              renderedAfterIdx.add(aIdx);
              return;
            }
            if (afterTok.isOperator) return;

            // Find a before token with same text that isn't being moved
            const beforeMatchIdx = beforeTokens.findIndex(
              (b, bi) =>
                !b.isOperator &&
                normalize(b.text) === normalize(afterTok.text) &&
                !beforeMovementMap.has(bi)
            );

            if (beforeMatchIdx >= 0) {
              // Stationary — interpolate position between before and after (layout shift)
              const beforeTok = beforeTokens[beforeMatchIdx];
              const x = lerp(beforeTok.x, afterTok.x, animPhase);
              ctx.save();
              ctx.font = font;
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(afterTok.text, x, afterTok.y);
              ctx.restore();
              renderedAfterIdx.add(aIdx);
            }
          });

          // ── 3. Animate moving tokens ──
          beforeMovementMap.forEach((movement, bIdx) => {
            const beforeTok = beforeTokens[bIdx];
            if (!beforeTok) return;

            // Find target position (after-token matching resultingTerm)
            const targetTok = afterTokens.find(
              (a) => !a.isOperator && normalize(a.text) === normalize(movement.resultingTerm)
            );

            const startX = beforeTok.x;
            const startY = beforeTok.y;
            const endX = targetTok ? targetTok.x : beforeTok.x;
            const endY = targetTok ? targetTok.y : beforeTok.y;

            let cx = startX;
            let cy = startY;

            if (movement.animationType === "arc") {
              // Arc across the equals sign
              const arcHeight = -55;
              cx = lerp(startX, endX, animPhase);
              cy =
                lerp(startY, endY, animPhase) +
                arcHeight * Math.sin(animPhase * Math.PI);
            } else if (movement.animationType === "merge") {
              // Converge toward target; shrink/fade at end
              cx = lerp(startX, endX, animPhase);
              cy = lerp(startY, endY, animPhase);
            } else if (movement.animationType === "fraction") {
              // Slide from LHS down and under target
              cx = lerp(startX, endX, animPhase);
              cy = lerp(startY, endY + 8, animPhase);
            } else {
              // Default: straight lerp
              cx = lerp(startX, endX, animPhase);
              cy = lerp(startY, endY, animPhase);
            }

            // Trail (arc only)
            if (movement.animationType === "arc" && animPhase > 0.05 && animPhase < 0.95) {
              ctx.save();
              ctx.strokeStyle = "#ffffff";
              ctx.globalAlpha = 0.12;
              ctx.lineWidth = 2;
              ctx.setLineDash([3, 5]);
              ctx.beginPath();
              for (let t = 0; t <= animPhase; t += 0.02) {
                const tx = lerp(startX, endX, t);
                const ty = lerp(startY, endY, t) - 55 * Math.sin(t * Math.PI);
                if (t === 0) ctx.moveTo(tx, ty);
                else ctx.lineTo(tx, ty);
              }
              ctx.stroke();
              ctx.restore();
            }

            // Determine display text
            let displayText = beforeTok.text;
            let alpha = 1;
            let scale = 1;

            if (movement.animationType === "arc") {
              // Transform at mid-flight (when crossing the equals sign)
              if (animPhase > 0.5) {
                displayText = movement.resultingTerm;
                if (animPhase < 0.6) {
                  scale = 1 + (1 - (animPhase - 0.5) / 0.1) * 0.25;
                }
              }
            } else if (movement.animationType === "merge") {
              // Shrink and fade as approaching target
              if (animPhase > 0.75) {
                alpha = Math.max(0, 1 - (animPhase - 0.75) / 0.25);
                scale = Math.max(0.4, 1 - (animPhase - 0.75) * 2);
              }
            } else if (movement.animationType === "fraction") {
              // Shrink to fraction denominator size
              if (animPhase > 0.7) {
                scale = Math.max(0.6, 1 - (animPhase - 0.7) * 0.8);
                alpha = Math.max(0, 1 - (animPhase - 0.85) / 0.15);
              }
            }

            ctx.save();
            ctx.font = font;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = alpha;

            if (scale !== 1) {
              ctx.translate(cx, cy);
              ctx.scale(scale, scale);
              ctx.translate(-cx, -cy);
            }

            ctx.fillText(displayText, cx, cy);
            ctx.restore();
          });

          // ── 4. Fade in new after-tokens (merge results, new terms) ──
          afterTokens.forEach((afterTok, aIdx) => {
            if (afterTok.isOperator) return;
            if (renderedAfterIdx.has(aIdx)) return;

            // This is a new token (created by merge, fraction, or fresh insert).
            // Fade in near the end of the animation.
            const isMergeTarget = afterIsTarget.has(aIdx);
            const fadeStart = isMergeTarget ? 0.7 : 0.55;
            const fadeProgress = Math.max(0, (animPhase - fadeStart) / (1 - fadeStart));

            if (fadeProgress > 0) {
              ctx.save();
              ctx.font = font;
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.globalAlpha = easeOut(fadeProgress);
              ctx.fillText(afterTok.text, afterTok.x, afterTok.y);
              ctx.restore();
            }
          });
        }
      }

      // ── Floating particles ─────────────────────────────────
      const time = now / 1000;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 12; i++) {
        const px = (Math.sin(time * 0.2 + i * 2.1) * 0.5 + 0.5) * canvasW;
        const py = (Math.cos(time * 0.15 + i * 2.7) * 0.5 + 0.5) * canvasH;
        const sz = 1 + Math.sin(time * 0.8 + i) * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [steps, isPlaying, playbackSpeed, currentStep, completedSteps, renderStaticEquation, onStepChange]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-xl"
      style={{ display: "block" }}
    />
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
