"use client";

import { useRef, useState, useEffect } from "react";

interface EquationStageProps {
  width: number;
  height: number;
  children: React.ReactNode;
}

interface Particle {
  id: number;
  cx: number;
  cy: number;
  r: number;
  speedX: number;
  speedY: number;
  phaseX: number;
  phaseY: number;
  opacity: number;
}

function generateParticles(count: number, width: number, height: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    cx: Math.random() * width,
    cy: Math.random() * height,
    r: 1 + Math.random() * 2.5,
    speedX: 0.3 + Math.random() * 0.7,
    speedY: 0.2 + Math.random() * 0.5,
    phaseX: Math.random() * Math.PI * 2,
    phaseY: Math.random() * Math.PI * 2,
    opacity: 0.15 + Math.random() * 0.35,
  }));
}

export default function EquationStage({ width, height, children }: EquationStageProps) {
  const [particles] = useState<Particle[]>(() => generateParticles(12, width, height));
  const [time, setTime] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let start: number | null = null;

    function tick(timestamp: number) {
      if (start === null) start = timestamp;
      setTime((timestamp - start) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const GRID_SPACING = 50;

  // Vertical grid lines
  const verticalLines: number[] = [];
  for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
    verticalLines.push(x);
  }

  // Horizontal grid lines
  const horizontalLines: number[] = [];
  for (let y = GRID_SPACING; y < height; y += GRID_SPACING) {
    horizontalLines.push(y);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "hidden", borderRadius: "12px" }}
    >
      {/* ── Defs: gradients and filters ── */}
      <defs>
        {/* Background gradient */}
        <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0f0c29" />
          <stop offset="50%" stopColor="#1a1545" />
          <stop offset="100%" stopColor="#24243e" />
        </linearGradient>

        {/* Glow filter for final-answer tokens */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.3
                    0 0 0 0 0.8
                    0 0 0 0 1
                    0 0 0 1.2 0"
            result="colorBlur"
          />
          <feMerge>
            <feMergeNode in="colorBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Radial vignette for depth */}
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
      </defs>

      {/* ── Background ── */}
      <rect width={width} height={height} fill="url(#bg-gradient)" />
      <rect width={width} height={height} fill="url(#vignette)" />

      {/* ── Grid lines ── */}
      <g>
        {verticalLines.map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth={1}
          />
        ))}
        {horizontalLines.map((y) => (
          <line
            key={`h-${y}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth={1}
          />
        ))}
      </g>

      {/* ── Floating particles ── */}
      <g>
        {particles.map((p) => {
          const px = p.cx + Math.sin(time * p.speedX + p.phaseX) * 30;
          const py = p.cy + Math.cos(time * p.speedY + p.phaseY) * 20;
          return (
            <circle
              key={p.id}
              cx={px}
              cy={py}
              r={p.r}
              fill="rgba(120, 160, 255, 1)"
              opacity={p.opacity * (0.7 + 0.3 * Math.sin(time * 0.8 + p.phaseX))}
            />
          );
        })}
      </g>

      {/* ── Content ── */}
      {children}
    </svg>
  );
}
