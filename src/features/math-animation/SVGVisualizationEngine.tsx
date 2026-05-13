"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import type { SolutionStep, MathToken } from "./types";
import { useAnimationController } from "./useAnimationController";
import { tokenizeEquation } from "./tokenizer";
import { layoutTokens, measureText } from "./layoutEngine";
import AnimatedToken from "./components/AnimatedToken";
import StepConnector from "./components/StepConnector";

// ---------------------------------------------------------------------------
// Sub-components inlined for simplicity
// ---------------------------------------------------------------------------

/** Full-screen SVG wrapper with background and grid */
function EquationStage({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  if (width === 0 || height === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", borderRadius: 12, overflow: "hidden" }}
    >
      <defs>
        {/* Glow filter for solution steps */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Background gradient */}
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f0c29" />
          <stop offset="50%" stopColor="#1a1545" />
          <stop offset="100%" stopColor="#24243e" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width={width} height={height} fill="url(#bgGrad)" />

      {/* Grid lines */}
      <g stroke="rgba(255,255,255,0.04)" strokeWidth={1}>
        {Array.from({ length: Math.ceil(width / 50) }, (_, i) => (
          <line key={`gx${i}`} x1={i * 50} y1={0} x2={i * 50} y2={height} />
        ))}
        {Array.from({ length: Math.ceil(height / 50) }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={i * 50} x2={width} y2={i * 50} />
        ))}
      </g>

      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AnimatedStep: renders a single equation step (description + tokens)
// ---------------------------------------------------------------------------

interface AnimatedStepProps {
  step: SolutionStep;
  prevStep: SolutionStep | undefined;
  y: number;
  centerX: number;
  maxWidth: number;
  progress: number;
  isComplete: boolean;
  isActive: boolean;
  baseFontSize: number;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalize(s: string): string {
  return s.replace(/\u2212/g, "-").replace(/\s+/g, "").trim();
}

function AnimatedStep({
  step,
  prevStep,
  y,
  centerX,
  maxWidth,
  progress,
  isComplete,
  isActive,
  baseFontSize,
}: AnimatedStepProps) {
  const isSolution = step.operation === "solution";
  const descFontSize = Math.min(11, Math.max(9, maxWidth * 0.014));

  // Tokenize and layout for the after equation
  const afterTokens = useMemo(
    () =>
      layoutTokens(
        tokenizeEquation(step.afterEquation),
        centerX,
        y,
        baseFontSize,
        maxWidth
      ),
    [step.afterEquation, centerX, y, baseFontSize, maxWidth]
  );

  // Tokenize and layout for the before equation (for animation)
  const beforeTokens = useMemo(
    () =>
      step.beforeEquation
        ? layoutTokens(
            tokenizeEquation(step.beforeEquation),
            centerX,
            y,
            baseFontSize,
            maxWidth
          )
        : [],
    [step.beforeEquation, centerX, y, baseFontSize, maxWidth]
  );

  const color = isSolution ? "#16c79a" : "#ffffff";

  // ── COMPLETED STEP: static rendering ──────────────────────────
  if (isComplete) {
    return (
      <g>
        {/* Description */}
        {step.description && step.operation !== "display" && (
          <text
            x={centerX}
            y={y - 26}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={descFontSize}
            fontFamily="'Inter', system-ui, sans-serif"
            fill="#a29bfe"
            opacity={0.6}
          >
            {step.description}
          </text>
        )}

        {/* Equation tokens */}
        {afterTokens.map((tok) => (
          <text
            key={tok.id}
            x={tok.x}
            y={tok.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={tok.fontSize}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
            fontWeight={isSolution ? 700 : 500}
            fill={color}
            filter={isSolution ? "url(#glow)" : undefined}
            style={{ userSelect: "none" }}
          >
            {tok.text}
          </text>
        ))}
      </g>
    );
  }

  // ── ACTIVE STEP: animated rendering ───────────────────────────
  if (!isActive) return null;

  const animPhase = easeInOut(progress);
  const hasMovements = step.termMovements.length > 0;

  // No movements: simple fade-in of the after equation
  if (!hasMovements) {
    const fadeAlpha = easeOut(Math.min(progress * 1.5, 1));

    return (
      <g>
        {/* Description fade in */}
        {step.description && step.operation !== "display" && (
          <text
            x={centerX}
            y={y - 26}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={descFontSize}
            fontFamily="'Inter', system-ui, sans-serif"
            fill="#a29bfe"
            opacity={easeOut(Math.min(progress * 3, 1)) * 0.7}
          >
            {step.description}
          </text>
        )}

        {afterTokens.map((tok) => (
          <text
            key={tok.id}
            x={tok.x}
            y={tok.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={tok.fontSize}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
            fontWeight={isSolution ? 700 : 500}
            fill={color}
            opacity={fadeAlpha}
            filter={isSolution ? "url(#glow)" : undefined}
            style={{ userSelect: "none" }}
          >
            {tok.text}
          </text>
        ))}
      </g>
    );
  }

  // ── With movements: full token animation ──────────────────────
  // 1. Build movement maps
  const beforeMovementMap = new Map<
    number,
    (typeof step.termMovements)[0]
  >();
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

  // 2. Identify stationary tokens (exist in both before and after, not moved)
  const renderedAfterIdx = new Set<number>();
  const stationaryElements: React.ReactNode[] = [];

  afterTokens.forEach((afterTok, aIdx) => {
    // Equals sign always stays
    if (afterTok.side === "equals") {
      stationaryElements.push(
        <text
          key={`eq-${aIdx}`}
          x={afterTok.x}
          y={afterTok.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={afterTok.fontSize}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fontWeight={500}
          fill="#ffffff"
          style={{ userSelect: "none" }}
        >
          =
        </text>
      );
      renderedAfterIdx.add(aIdx);
      return;
    }

    if (afterTok.isOperator) return;

    // Find a matching before-token that isn't being moved
    const beforeMatchIdx = beforeTokens.findIndex(
      (b, bi) =>
        !b.isOperator &&
        normalize(b.text) === normalize(afterTok.text) &&
        !beforeMovementMap.has(bi)
    );

    if (beforeMatchIdx >= 0) {
      const beforeTok = beforeTokens[beforeMatchIdx];
      const interpX = lerp(beforeTok.x, afterTok.x, animPhase);
      stationaryElements.push(
        <text
          key={`stat-${aIdx}`}
          x={interpX}
          y={afterTok.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={afterTok.fontSize}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fontWeight={500}
          fill="#ffffff"
          style={{ userSelect: "none" }}
        >
          {afterTok.text}
        </text>
      );
      renderedAfterIdx.add(aIdx);
    }
  });

  // 3. Moving tokens
  const movingElements: React.ReactNode[] = [];
  beforeMovementMap.forEach((movement, bIdx) => {
    const beforeTok = beforeTokens[bIdx];
    if (!beforeTok) return;

    const targetTok = afterTokens.find(
      (a) =>
        !a.isOperator &&
        normalize(a.text) === normalize(movement.resultingTerm)
    );

    const startX = beforeTok.x;
    const startY2 = beforeTok.y;
    const endX = targetTok ? targetTok.x : beforeTok.x;
    const endY = targetTok ? targetTok.y : beforeTok.y;

    let cx = startX;
    let cy = startY2;

    if (movement.animationType === "arc") {
      const arcHeight = -55;
      cx = lerp(startX, endX, animPhase);
      cy =
        lerp(startY2, endY, animPhase) +
        arcHeight * Math.sin(animPhase * Math.PI);
    } else if (movement.animationType === "merge") {
      cx = lerp(startX, endX, animPhase);
      cy = lerp(startY2, endY, animPhase);
    } else if (movement.animationType === "fraction") {
      cx = lerp(startX, endX, animPhase);
      cy = lerp(startY2, endY + 8, animPhase);
    } else {
      cx = lerp(startX, endX, animPhase);
      cy = lerp(startY2, endY, animPhase);
    }

    // Determine display text, alpha, scale
    let displayText = beforeTok.text;
    let alpha = 1;
    let scale = 1;

    if (movement.animationType === "arc") {
      if (animPhase > 0.5) {
        displayText = movement.resultingTerm;
        if (animPhase < 0.6) {
          scale = 1 + (1 - (animPhase - 0.5) / 0.1) * 0.25;
        }
      }
    } else if (movement.animationType === "merge") {
      if (animPhase > 0.75) {
        alpha = Math.max(0, 1 - (animPhase - 0.75) / 0.25);
        scale = Math.max(0.4, 1 - (animPhase - 0.75) * 2);
      }
    } else if (movement.animationType === "fraction") {
      if (animPhase > 0.7) {
        scale = Math.max(0.6, 1 - (animPhase - 0.7) * 0.8);
        alpha = Math.max(0, 1 - (animPhase - 0.85) / 0.15);
      }
    }

    const fontSize = beforeTok.fontSize;

    // Arc trail
    if (
      movement.animationType === "arc" &&
      animPhase > 0.05 &&
      animPhase < 0.95
    ) {
      const pathParts: string[] = [];
      for (let t = 0; t <= animPhase; t += 0.02) {
        const tx = lerp(startX, endX, t);
        const ty = lerp(startY2, endY, t) - 55 * Math.sin(t * Math.PI);
        pathParts.push(t === 0 ? `M${tx},${ty}` : `L${tx},${ty}`);
      }
      movingElements.push(
        <path
          key={`trail-${bIdx}`}
          d={pathParts.join(" ")}
          stroke="#ffffff"
          strokeWidth={2}
          strokeDasharray="3 5"
          fill="none"
          opacity={0.12}
        />
      );
    }

    movingElements.push(
      <g
        key={`mov-${bIdx}`}
        transform={`translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`}
        opacity={alpha}
      >
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fontWeight={500}
          fill="#ffffff"
          style={{ userSelect: "none" }}
        >
          {displayText}
        </text>
      </g>
    );
  });

  // 4. Fade-in new after-tokens (merge results, newly created terms)
  const fadeInElements: React.ReactNode[] = [];
  afterTokens.forEach((afterTok, aIdx) => {
    if (afterTok.isOperator) return;
    if (renderedAfterIdx.has(aIdx)) return;

    const isMergeTarget = afterIsTarget.has(aIdx);
    const fadeStart = isMergeTarget ? 0.7 : 0.55;
    const fadeProgress = Math.max(
      0,
      (animPhase - fadeStart) / (1 - fadeStart)
    );

    if (fadeProgress > 0) {
      fadeInElements.push(
        <text
          key={`fade-${aIdx}`}
          x={afterTok.x}
          y={afterTok.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={afterTok.fontSize}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fontWeight={500}
          fill="#ffffff"
          opacity={easeOut(fadeProgress)}
          style={{ userSelect: "none" }}
        >
          {afterTok.text}
        </text>
      );
    }
  });

  return (
    <g>
      {/* Description */}
      {step.description && step.operation !== "display" && (
        <text
          x={centerX}
          y={y - 26}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={descFontSize}
          fontFamily="'Inter', system-ui, sans-serif"
          fill="#a29bfe"
          opacity={easeOut(Math.min(progress * 3, 1)) * 0.7}
        >
          {step.description}
        </text>
      )}
      {stationaryElements}
      {movingElements}
      {fadeInElements}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component — drop-in replacement for canvas VisualizationEngine
// ---------------------------------------------------------------------------

interface Props {
  steps: SolutionStep[];
  isPlaying: boolean;
  playbackSpeed: number;
  currentStep: number;
  onStepChange: (step: number) => void;
}

export default function SVGVisualizationEngine({
  steps,
  isPlaying,
  playbackSpeed,
  currentStep,
  onStepChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // ── 1. ResizeObserver for responsive sizing ─────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateSize();

    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  // ── 2. Animation controller ─────────────────────────────────────
  const { progress, completedSteps } = useAnimationController(
    steps,
    isPlaying,
    playbackSpeed,
    currentStep,
    onStepChange
  );

  // ── 3. Layout calculations ──────────────────────────────────────
  const { width, height } = dimensions;
  const centerX = width / 2;
  const baseFontSize = Math.min(22, Math.max(13, width * 0.028));

  // stepGap adapts to step count and viewport height
  const stepGap = Math.max(
    60,
    Math.min(130, height / Math.max(4, steps.length + 1))
  );

  const startYBase = 80;
  const totalContentHeight = steps.length * stepGap + 160;

  // Auto-scroll to keep current step centered in viewport
  const idealCurrentY = startYBase + currentStep * stepGap;
  const scrollOffset =
    totalContentHeight > height
      ? Math.max(
          0,
          Math.min(
            idealCurrentY - height * 0.4,
            totalContentHeight - height
          )
        )
      : 0;

  const startY = startYBase;

  // ── 4. Floating particles (animated via CSS) ────────────────────
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      cx: ((Math.sin(i * 2.1) * 0.5 + 0.5) * 100).toFixed(1),
      cy: ((Math.cos(i * 2.7) * 0.5 + 0.5) * 100).toFixed(1),
      r: 1 + Math.sin(i) * 0.5,
    }));
  }, []);

  // ── 5. Render ───────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="w-full h-full">
      <EquationStage width={width} height={height}>
        {/* Floating particles */}
        <g opacity={0.08}>
          {particles.map((p) => (
            <circle
              key={p.id}
              cx={`${p.cx}%`}
              cy={`${p.cy}%`}
              r={p.r}
              fill="#ffffff"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0,0; ${15 * Math.sin(p.id)},${10 * Math.cos(p.id)}; 0,0`}
                dur={`${6 + p.id * 0.7}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </g>

        {/* Auto-scrolling transform group */}
        <g
          transform={`translate(0, ${-scrollOffset})`}
          style={{
            transition: "transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
        >
          {/* Completed steps (static) */}
          {completedSteps.map((i) => (
            <AnimatedStep
              key={`completed-${i}`}
              step={steps[i]}
              prevStep={i > 0 ? steps[i - 1] : undefined}
              y={startY + i * stepGap}
              centerX={centerX}
              maxWidth={width}
              progress={1}
              isComplete={true}
              isActive={false}
              baseFontSize={baseFontSize}
            />
          ))}

          {/* Current animating step */}
          {currentStep < steps.length && (
            <AnimatedStep
              key={`active-${currentStep}`}
              step={steps[currentStep]}
              prevStep={
                currentStep > 0 ? steps[currentStep - 1] : undefined
              }
              y={startY + currentStep * stepGap}
              centerX={centerX}
              maxWidth={width}
              progress={progress}
              isComplete={false}
              isActive={true}
              baseFontSize={baseFontSize}
            />
          )}

          {/* Step connectors between completed steps */}
          {completedSteps.map(
            (i) =>
              i < steps.length - 1 && (
                <StepConnector
                  key={`connector-${i}`}
                  x={centerX}
                  y1={startY + i * stepGap + 30}
                  y2={startY + (i + 1) * stepGap - 30}
                  opacity={0.4}
                />
              )
          )}
        </g>
      </EquationStage>
    </div>
  );
}
