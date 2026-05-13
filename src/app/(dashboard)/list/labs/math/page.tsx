"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { type SolutionData } from "@/lib/equationSolver";
import { solveMath, type MathResult } from "@/lib/math/solvePipeline";
import { askClaudeStreaming } from "@/lib/math/claudeService";
import { askWolframAgent } from "@/lib/math/wolframAgent";
// Wolfram Alpha is primary, GPT-4o for explanations, AgentOne for follow-ups
import VisualizationEngine from "@/features/math-animation";
import PlaybackControls from "@/components/labs/PlaybackControls";
import MathInput, { type MathSubject, type ShapeSubmitData, type ShapeTemplate, type MathInputHandle } from "@/components/labs/MathInput";
import KaTeXRenderer from "@/components/labs/KaTeXRenderer";
import PlotlyGraph from "@/components/labs/PlotlyGraph";
import PhotoInput from "@/components/labs/PhotoInput";
import StepByStepAnimator from "@/features/math-animation/components/StepByStepAnimator";

type SubjectOrGraphing = MathSubject | "graphing";

const subjects: { id: SubjectOrGraphing; label: string; icon: string; iconSvg?: string }[] = [
  { id: "basicmath", label: "Basic Math", icon: "", iconSvg: "basicmath" },
  { id: "prealgebra", label: "Pre-Algebra", icon: "", iconSvg: "prealgebra" },
  { id: "algebra", label: "Algebra", icon: "", iconSvg: "algebra" },
  { id: "trigonometry", label: "Trigonometry", icon: "", iconSvg: "trigonometry" },
  { id: "precalculus", label: "Precalculus", icon: "", iconSvg: "precalculus" },
  { id: "calculus", label: "Calculus", icon: "", iconSvg: "calculus" },
  { id: "statistics", label: "Statistics", icon: "", iconSvg: "statistics" },
  { id: "finitemath", label: "Finite Math", icon: "", iconSvg: "finitemath" },
  { id: "linearalgebra", label: "Linear Algebra", icon: "", iconSvg: "linearalgebra" },
  { id: "chemistry", label: "Chemistry", icon: "", iconSvg: "chemistry" },
  { id: "physics", label: "Physics", icon: "", iconSvg: "physics" },
  { id: "graphing", label: "Graphing", icon: "", iconSvg: "graphing" },
];

interface ShapeSolutionStep { text: string; final?: boolean; }

interface ChatMessage {
  id: string;
  role: "bot" | "user";
  content: string;
  solution?: SolutionData;
  mathResult?: MathResult;
  shapeSolution?: { title: string; steps: ShapeSolutionStep[] };
  shapeDisplay?: { shapeName: string; icon: string; values: Record<string, number> };
  claudeStream?: boolean;
  graphExpressions?: string[];
  isLoading?: boolean;
}

// ─── Shape calculation helpers (unchanged) ──────────────────────
function getCalcOptions(shapeName: string): string[] {
  const opts: Record<string, string[]> = {
    Circle: ["Find the Area", "Find the Circumference", "Find the Diameter"],
    Triangle: ["Find the Area", "Find the Hypotenuse", "Find the Perimeter"],
    Rectangle: ["Find the Area", "Find the Perimeter", "Find the Diagonal"],
    "Rectangular Prism": ["Find the Volume", "Find the Surface Area", "Find the Diagonal"],
    Sphere: ["Find the Volume", "Find the Surface Area", "Find the Diameter"],
    Cone: ["Find the Volume", "Find the Surface Area", "Find the Slant Height"],
    Cylinder: ["Find the Volume", "Find the Surface Area"],
    Pyramid: ["Find the Volume", "Find the Surface Area", "Find the Slant Height"],
    Parallelogram: ["Find the Area", "Find the Perimeter"],
    Trapezoid: ["Find the Area", "Find the Perimeter"],
    Composite: ["Find the Total Area", "Find the Difference"],
  };
  return opts[shapeName] || ["Find the Area", "Find the Perimeter"];
}

function calculateShape(shapeName: string, calcType: string, vals: Record<string, number>): ShapeSolutionStep[] {
  const pi = Math.PI, steps: ShapeSolutionStep[] = [];
  switch (shapeName) {

    case "Circle": {
      const r = vals.r;
      if (calcType.includes("Area")) {
        steps.push({ text: "Formula: A = πr²" });
        steps.push({ text: `A = π × ${r}²` });
        steps.push({ text: `A = π × ${r * r}` });
        steps.push({ text: `A = ${(pi * r * r).toFixed(4)}`, final: true });
      } else if (calcType.includes("Circumference")) {
        steps.push({ text: "Formula: C = 2πr" });
        steps.push({ text: `C = 2 × π × ${r}` });
        steps.push({ text: `C = ${(2 * pi * r).toFixed(4)}`, final: true });
      } else if (calcType.includes("Diameter")) {
        steps.push({ text: "Formula: d = 2r" });
        steps.push({ text: `d = 2 × ${r}` });
        steps.push({ text: `d = ${2 * r}`, final: true });
      }
      break;
    }

    case "Triangle": {
      const b = vals.b, h = vals.h;
      if (calcType.includes("Area")) {
        steps.push({ text: "Formula: A = ½ × b × h" });
        steps.push({ text: `A = ½ × ${b} × ${h}` });
        steps.push({ text: `A = ${(0.5 * b * h)}`, final: true });
      } else if (calcType.includes("Hypotenuse")) {
        // Right triangle: c = √(b² + h²)
        const c = Math.sqrt(b * b + h * h);
        steps.push({ text: "Formula (right triangle): c = √(b² + h²)" });
        steps.push({ text: `c = √(${b}² + ${h}²)` });
        steps.push({ text: `c = √(${b * b} + ${h * h})` });
        steps.push({ text: `c = √${b * b + h * h}` });
        steps.push({ text: `c = ${c.toFixed(4)}`, final: true });
      } else if (calcType.includes("Perimeter")) {
        // Right triangle: P = b + h + √(b²+h²)
        const c = Math.sqrt(b * b + h * h);
        const P = b + h + c;
        steps.push({ text: "For a right triangle: P = b + h + c" });
        steps.push({ text: `Hypotenuse c = √(${b}² + ${h}²) = ${c.toFixed(4)}` });
        steps.push({ text: `P = ${b} + ${h} + ${c.toFixed(4)}` });
        steps.push({ text: `P = ${P.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Rectangle": {
      const l = vals.l, w = vals.w;
      if (calcType.includes("Area")) {
        steps.push({ text: "Formula: A = l × w" });
        steps.push({ text: `A = ${l} × ${w}` });
        steps.push({ text: `A = ${l * w}`, final: true });
      } else if (calcType.includes("Perimeter")) {
        steps.push({ text: "Formula: P = 2(l + w)" });
        steps.push({ text: `P = 2(${l} + ${w})` });
        steps.push({ text: `P = 2 × ${l + w}` });
        steps.push({ text: `P = ${2 * (l + w)}`, final: true });
      } else if (calcType.includes("Diagonal")) {
        const d = Math.sqrt(l * l + w * w);
        steps.push({ text: "Formula: d = √(l² + w²)" });
        steps.push({ text: `d = √(${l}² + ${w}²)` });
        steps.push({ text: `d = √(${l * l} + ${w * w})` });
        steps.push({ text: `d = ${d.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Rectangular Prism": {
      const h = vals.h, l = vals.l, w = vals.w;
      if (calcType.includes("Volume")) {
        steps.push({ text: "Formula: V = l × w × h" });
        steps.push({ text: `V = ${l} × ${w} × ${h}` });
        steps.push({ text: `V = ${l * w * h}`, final: true });
      } else if (calcType.includes("Surface")) {
        const sa = 2 * (l * w + l * h + w * h);
        steps.push({ text: "Formula: SA = 2(lw + lh + wh)" });
        steps.push({ text: `SA = 2(${l}×${w} + ${l}×${h} + ${w}×${h})` });
        steps.push({ text: `SA = 2(${l * w} + ${l * h} + ${w * h})` });
        steps.push({ text: `SA = 2 × ${l * w + l * h + w * h}` });
        steps.push({ text: `SA = ${sa}`, final: true });
      } else if (calcType.includes("Diagonal")) {
        const d = Math.sqrt(l * l + w * w + h * h);
        steps.push({ text: "Formula: d = √(l² + w² + h²)" });
        steps.push({ text: `d = √(${l * l} + ${w * w} + ${h * h})` });
        steps.push({ text: `d = ${d.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Pyramid": {
      const h = vals.h, l = vals.l, w = vals.w;
      if (calcType.includes("Volume")) {
        // Square pyramid: V = (1/3) × base area × h = (1/3) × w² × h
        const v = (1 / 3) * w * w * h;
        steps.push({ text: "Formula (square base): V = (1/3) × w² × h" });
        steps.push({ text: `V = (1/3) × ${w}² × ${h}` });
        steps.push({ text: `V = (1/3) × ${w * w} × ${h}` });
        steps.push({ text: `V = (1/3) × ${w * w * h}` });
        steps.push({ text: `V = ${v.toFixed(4)}`, final: true });
      } else if (calcType.includes("Surface")) {
        // SA = base area + lateral area = w² + 2wl
        const slant = l > 0 ? l : Math.sqrt((w / 2) ** 2 + h ** 2);
        const sa = w * w + 2 * w * slant;
        steps.push({ text: "Formula: SA = w² + 2 × w × l" });
        if (l <= 0) steps.push({ text: `Slant height l = √((w/2)² + h²) = √(${(w / 2) ** 2} + ${h ** 2}) = ${slant.toFixed(4)}` });
        steps.push({ text: `SA = ${w}² + 2 × ${w} × ${slant.toFixed(4)}` });
        steps.push({ text: `SA = ${w * w} + ${(2 * w * slant).toFixed(4)}` });
        steps.push({ text: `SA = ${sa.toFixed(4)}`, final: true });
      } else if (calcType.includes("Slant")) {
        const slant = Math.sqrt((w / 2) ** 2 + h ** 2);
        steps.push({ text: "Formula: l = √((w/2)² + h²)" });
        steps.push({ text: `l = √((${w}/2)² + ${h}²)` });
        steps.push({ text: `l = √(${(w / 2) ** 2} + ${h ** 2})` });
        steps.push({ text: `l = ${slant.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Sphere": {
      const r = vals.r;
      if (calcType.includes("Volume")) {
        steps.push({ text: "Formula: V = (4/3)πr³" });
        steps.push({ text: `V = (4/3) × π × ${r}³` });
        steps.push({ text: `V = (4/3) × π × ${r ** 3}` });
        steps.push({ text: `V = ${((4 / 3) * pi * r ** 3).toFixed(4)}`, final: true });
      } else if (calcType.includes("Surface")) {
        steps.push({ text: "Formula: SA = 4πr²" });
        steps.push({ text: `SA = 4 × π × ${r}²` });
        steps.push({ text: `SA = 4 × π × ${r * r}` });
        steps.push({ text: `SA = ${(4 * pi * r * r).toFixed(4)}`, final: true });
      } else if (calcType.includes("Diameter")) {
        steps.push({ text: "Formula: d = 2r" });
        steps.push({ text: `d = 2 × ${r}` });
        steps.push({ text: `d = ${2 * r}`, final: true });
      }
      break;
    }

    case "Cone": {
      const r = vals.r, h = vals.h;
      const sl = Math.sqrt(r * r + h * h);
      if (calcType.includes("Volume")) {
        steps.push({ text: "Formula: V = (1/3)πr²h" });
        steps.push({ text: `V = (1/3) × π × ${r}² × ${h}` });
        steps.push({ text: `V = (1/3) × π × ${r * r} × ${h}` });
        steps.push({ text: `V = ${((1 / 3) * pi * r * r * h).toFixed(4)}`, final: true });
      } else if (calcType.includes("Slant")) {
        steps.push({ text: "Formula: l = √(r² + h²)" });
        steps.push({ text: `l = √(${r}² + ${h}²)` });
        steps.push({ text: `l = √(${r * r} + ${h * h})` });
        steps.push({ text: `l = ${sl.toFixed(4)}`, final: true });
      } else if (calcType.includes("Surface")) {
        // Total SA = πr² + πrl
        const sa = pi * r * r + pi * r * sl;
        steps.push({ text: "Formula: SA = πr² + πrl (base + lateral)" });
        steps.push({ text: `Slant height l = √(r² + h²) = ${sl.toFixed(4)}` });
        steps.push({ text: `SA = π × ${r}² + π × ${r} × ${sl.toFixed(4)}` });
        steps.push({ text: `SA = ${(pi * r * r).toFixed(4)} + ${(pi * r * sl).toFixed(4)}` });
        steps.push({ text: `SA = ${sa.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Cylinder": {
      const r = vals.r, h = vals.h;
      if (calcType.includes("Volume")) {
        steps.push({ text: "Formula: V = πr²h" });
        steps.push({ text: `V = π × ${r}² × ${h}` });
        steps.push({ text: `V = π × ${r * r} × ${h}` });
        steps.push({ text: `V = ${(pi * r * r * h).toFixed(4)}`, final: true });
      } else if (calcType.includes("Surface")) {
        // Total SA = 2πr² + 2πrh = 2πr(r + h)
        const sa = 2 * pi * r * (r + h);
        steps.push({ text: "Formula: SA = 2πr(r + h)" });
        steps.push({ text: `SA = 2 × π × ${r} × (${r} + ${h})` });
        steps.push({ text: `SA = 2 × π × ${r} × ${r + h}` });
        steps.push({ text: `SA = ${sa.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Parallelogram": {
      const b = vals.b, h = vals.h;
      if (calcType.includes("Area")) {
        steps.push({ text: "Formula: A = b × h" });
        steps.push({ text: `A = ${b} × ${h}` });
        steps.push({ text: `A = ${b * h}`, final: true });
      } else if (calcType.includes("Perimeter")) {
        // Need side length; approximate: side = h/sin(angle) ≈ h (if angle ~90°)
        // For a parallelogram, P = 2(b + side). Since we only have b and h (height),
        // we note that side ≥ h, and exact perimeter requires the side or angle.
        // Use h as minimum side estimate with note.
        const side = h; // minimum possible side length
        steps.push({ text: "Formula: P = 2(b + side)" });
        steps.push({ text: `Note: Using height as side length (assumes right angles)` });
        steps.push({ text: `P = 2(${b} + ${side})` });
        steps.push({ text: `P = ${2 * (b + side)}`, final: true });
      }
      break;
    }

    case "Trapezoid": {
      const a = vals.a, b = vals.b, h = vals.h;
      if (calcType.includes("Area")) {
        steps.push({ text: "Formula: A = ½(a + b) × h" });
        steps.push({ text: `A = ½(${a} + ${b}) × ${h}` });
        steps.push({ text: `A = ½ × ${a + b} × ${h}` });
        steps.push({ text: `A = ${(0.5 * (a + b) * h).toFixed(4)}`, final: true });
      } else if (calcType.includes("Perimeter")) {
        // Isosceles trapezoid: each leg = √(((b-a)/2)² + h²)
        const leg = Math.sqrt(((b - a) / 2) ** 2 + h * h);
        const P = a + b + 2 * leg;
        steps.push({ text: "Formula (isosceles): P = a + b + 2 × leg" });
        steps.push({ text: `leg = √(((b-a)/2)² + h²)` });
        steps.push({ text: `leg = √(((${b}-${a})/2)² + ${h}²)` });
        steps.push({ text: `leg = √(${((b - a) / 2) ** 2} + ${h * h}) = ${leg.toFixed(4)}` });
        steps.push({ text: `P = ${a} + ${b} + 2 × ${leg.toFixed(4)}` });
        steps.push({ text: `P = ${P.toFixed(4)}`, final: true });
      }
      break;
    }

    case "Composite": {
      const A1 = vals.A1, A2 = vals.A2;
      if (calcType.includes("Total")) {
        steps.push({ text: "Formula: A = A₁ + A₂" });
        steps.push({ text: `A = ${A1} + ${A2}` });
        steps.push({ text: `A = ${A1 + A2}`, final: true });
      } else if (calcType.includes("Difference")) {
        steps.push({ text: "Formula: A = |A₁ − A₂|" });
        steps.push({ text: `A = |${A1} − ${A2}|` });
        steps.push({ text: `A = ${Math.abs(A1 - A2)}`, final: true });
      }
      break;
    }

    default: {
      steps.push({ text: "Calculation not available for this shape.", final: true });
    }
  }
  if (!steps.length) steps.push({ text: "Calculation not available.", final: true });
  return steps;
}

// ─── Subject Icons (Mathway-style circular icons) ────────────
function SubjectIcon({ type, size = 22 }: { type?: string; size?: number }) {
  const bg = "#6b7c93";
  const fg = "#fff";
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={r} cy={r} r={r} fill={bg} />
      {type === "basicmath" && (
        <text x={r} y={r + 1} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={fg} fontFamily="serif">+</text>
      )}
      {type === "prealgebra" && (
        <text x={r} y={r + 1} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill={fg} fontFamily="serif">×</text>
      )}
      {type === "algebra" && (
        <g transform={`translate(${r - 6}, ${r - 5})`}>
          <text x="1" y="10" fontSize="10" fontWeight="400" fill={fg} fontFamily="Georgia, serif" fontStyle="italic">x</text>
          <text x="8" y="5" fontSize="7" fontWeight="400" fill={fg} fontFamily="Georgia, serif" fontStyle="italic">y</text>
        </g>
      )}
      {type === "trigonometry" && (
        <g transform={`translate(${r - 5}, ${r - 5})`}><polygon points="0,10 10,10 10,0" stroke={fg} strokeWidth="1.5" fill="none" /><line x1="3" y1="8" x2="3" y2="10" stroke={fg} strokeWidth="1" /><line x1="3" y1="10" x2="5" y2="10" stroke={fg} strokeWidth="1" /></g>
      )}
      {type === "precalculus" && (
        <g transform={`translate(${r - 6}, ${r - 5})`}>
          {/* S-curve / sigmoid */}
          <path d="M0,10 C3,10 4,8 6,5 C8,2 9,0 12,0" stroke={fg} strokeWidth="1.5" fill="none" />
          {/* Axes */}
          <line x1="0" y1="5" x2="12" y2="5" stroke={fg} strokeWidth="0.6" />
          <line x1="4" y1="0" x2="4" y2="10" stroke={fg} strokeWidth="0.6" />
        </g>
      )}
      {type === "calculus" && (
        <text x={r} y={r + 1} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="400" fill={fg} fontFamily="serif">∫</text>
      )}
      {type === "statistics" && (
        <g transform={`translate(${r - 5}, ${r - 5})`}><rect x="0" y="6" width="3" height="4" fill={fg} /><rect x="4" y="3" width="3" height="7" fill={fg} /><rect x="8" y="0" width="3" height="10" fill={fg} /></g>
      )}
      {type === "finitemath" && (
        <g transform={`translate(${r - 6}, ${r - 6})`}>
          {/* Edges - solid */}
          <line x1="6" y1="0" x2="0" y2="8" stroke={fg} strokeWidth="1.3" />
          <line x1="6" y1="0" x2="12" y2="8" stroke={fg} strokeWidth="1.3" />
          <line x1="6" y1="0" x2="6" y2="11" stroke={fg} strokeWidth="1.3" />
          <line x1="0" y1="8" x2="6" y2="11" stroke={fg} strokeWidth="1.3" />
          <line x1="12" y1="8" x2="6" y2="11" stroke={fg} strokeWidth="1.3" />
          {/* Edges - dashed (back) */}
          <line x1="0" y1="8" x2="12" y2="8" stroke={fg} strokeWidth="1" strokeDasharray="1.5,1.5" />
          {/* Vertices */}
          <circle cx="6" cy="0" r="1.5" fill={fg} />
          <circle cx="0" cy="8" r="1.5" fill={fg} />
          <circle cx="12" cy="8" r="1.5" fill={fg} />
          <circle cx="6" cy="11" r="1.5" fill={fg} />
        </g>
      )}
      {type === "linearalgebra" && (
        <g transform={`translate(${r - 5}, ${r - 5})`}>
          <line x1="1" y1="0" x2="1" y2="10" stroke={fg} strokeWidth="1.3" />
          <line x1="0" y1="0" x2="3" y2="0" stroke={fg} strokeWidth="1.3" />
          <line x1="0" y1="10" x2="3" y2="10" stroke={fg} strokeWidth="1.3" />
          <line x1="9" y1="0" x2="9" y2="10" stroke={fg} strokeWidth="1.3" />
          <line x1="7" y1="0" x2="10" y2="0" stroke={fg} strokeWidth="1.3" />
          <line x1="7" y1="10" x2="10" y2="10" stroke={fg} strokeWidth="1.3" />
          <circle cx="4" cy="3" r="0.8" fill={fg} />
          <circle cx="6" cy="3" r="0.8" fill={fg} />
          <circle cx="4" cy="7" r="0.8" fill={fg} />
          <circle cx="6" cy="7" r="0.8" fill={fg} />
        </g>
      )}
      {type === "chemistry" && (
        <g transform={`translate(${r - 5}, ${r - 6})`}>
          <path d="M3,0 L3,5 L0,11 L10,11 L7,5 L7,0" stroke={fg} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
          <line x1="3" y1="0" x2="7" y2="0" stroke={fg} strokeWidth="1.2" />
          <line x1="1.5" y1="8" x2="8.5" y2="8" stroke={fg} strokeWidth="0.8" />
        </g>
      )}
      {type === "physics" && (
        <g transform={`translate(${r}, ${r})`}><circle cx="0" cy="0" r="1.5" fill={fg} /><ellipse cx="0" cy="0" rx="6" ry="2.5" stroke={fg} strokeWidth="0.8" fill="none" transform="rotate(0)" /><ellipse cx="0" cy="0" rx="6" ry="2.5" stroke={fg} strokeWidth="0.8" fill="none" transform="rotate(60)" /><ellipse cx="0" cy="0" rx="6" ry="2.5" stroke={fg} strokeWidth="0.8" fill="none" transform="rotate(-60)" /></g>
      )}
      {type === "graphing" && (
        <g transform={`translate(${r - 5}, ${r - 5})`}><line x1="1" y1="9" x2="1" y2="0" stroke={fg} strokeWidth="1.2" /><line x1="1" y1="9" x2="10" y2="9" stroke={fg} strokeWidth="1.2" /><polyline points="2,7 4,4 6,6 9,1" stroke={fg} strokeWidth="1.2" fill="none" /></g>
      )}
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────
const LabsPage = () => {
  const [subject, setSubject] = useState<SubjectOrGraphing>("basicmath");
  const [navOpen, setNavOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "bot", content: "How can I help you? Type a math problem, ask a question, or take a photo of an equation." },
  ]);
  const [solution, setSolution] = useState<SolutionData | null>(null);
  const [showAnimation, setShowAnimation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentStep, setCurrentStep] = useState(0);
  const [, setEquation] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mathInputRef = useRef<MathInputHandle | null>(null);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [pendingShape, setPendingShape] = useState<{ shape: ShapeTemplate; values: Record<string, number> } | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [graphExpressions, setGraphExpressions] = useState<string[]>([]);

  // Live solving overlay state
  const [showSolving, setShowSolving] = useState(false);
  const [solvingEquation, setSolvingEquation] = useState("");
  const [solvingSteps, setSolvingSteps] = useState<{ text: string; status: "done" | "active" | "pending" }[]>([]);
  const [solvingSource, setSolvingSource] = useState("");
  const [solvingAnswer, setSolvingAnswer] = useState("");
  const [solvingStream, setSolvingStream] = useState("");
  const [lastSolvedEquation, setLastSolvedEquation] = useState("");
  const [lastSolvedAnswer, setLastSolvedAnswer] = useState("");

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Shape submit → modal ──
  const handleShapeSubmit = useCallback((data: ShapeSubmitData) => {
    setPendingShape({ shape: data.shape, values: data.values });
    setShowAnswerModal(true);
  }, []);

  const handleCalcChoice = useCallback((calcType: string) => {
    if (!pendingShape) return;
    setShowAnswerModal(false);
    const { shape, values } = pendingShape;
    const paramStr = shape.params.map((p) => `${p.symbol} = ${values[p.symbol]}`).join(", ");
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: `${shape.name}: ${paramStr}`, shapeDisplay: { shapeName: shape.name, icon: shape.icon, values } };
    const steps = calculateShape(shape.name, calcType, values);
    setMessages((p) => [...p, userMsg, { id: `b-${Date.now()}`, role: "bot", content: "", shapeSolution: { title: calcType, steps } }]);
    setPendingShape(null);
    mathInputRef.current?.clearShape();
  }, [pendingShape]);

  // ── Helper: open solving overlay ──
  // Clean GPT output: remove duplicate plaintext after LaTeX expressions
  const cleanGPTOutput = (text: string): string => {
    let cleaned = text;
    // Remove zero-width characters
    cleaned = cleaned.replace(/[\u200B\u200E\u200F\uFEFF]/g, "");
    // Remove duplicate plaintext after $...$: pattern is "$latex$\nplaintext fragments"
    // These fragments are 2+ consecutive short lines (1-5 chars each) after a $ delimiter
    cleaned = cleaned.replace(/(\$[^$]+\$)\s*\n((?:[ \t]*[^\n$#*]{1,6}[ \t]*\n){2,})/g, "$1\n");
    // Remove orphaned lines that are just subscript/superscript decomposition
    // Pattern: lines with only 1-3 characters that aren't headers, list items, or sentences
    const lines = cleaned.split("\n");
    const result: string[] = [];
    let skipRun = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip very short lines (1-3 chars) that appear in runs of 3+
      if (line.length <= 3 && line.length > 0 && !/^[#*\-\d]/.test(line) && !/^\$/.test(line)) {
        // Check if this is part of a run of short lines
        let runLen = 0;
        for (let j = i; j < Math.min(i + 8, lines.length); j++) {
          const l = lines[j].trim();
          if (l.length <= 5 && l.length > 0 && !/^[#*\-\d]/.test(l) && !/^\$/.test(l)) runLen++;
          else break;
        }
        if (runLen >= 3) { skipRun = runLen; }
      }
      if (skipRun > 0) { skipRun--; continue; }
      result.push(lines[i]);
    }
    cleaned = result.join("\n");
    // Clean excessive blank lines
    cleaned = cleaned.replace(/\n{4,}/g, "\n\n");
    return cleaned;
  };

  const openSolvingOverlay = (eq: string) => {
    setSolvingEquation(eq);
    setSolvingSteps([{ text: `Problem: ${eq}`, status: "done" }]);
    setSolvingSource("");
    setSolvingAnswer("");
    setSolvingStream("");
    setShowSolving(true);
  };

  const addSolvingStep = (text: string, status: "done" | "active" | "pending" = "done") => {
    setSolvingSteps((prev) => {
      const updated = prev.map((s) => ({ ...s, status: "done" as const }));
      return [...updated, { text, status }];
    });
  };

  const closeSolvingOverlay = () => {
    setShowSolving(false);
    setSolvingStream("");
  };

  // ── Main solve handler ──
  const handleSolve = useCallback(async (eq: string) => {
    if (!eq.trim()) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: eq };
    setMessages((p) => [...p, userMsg]);

    // Check if this is a plot/graph request referencing the previous problem
    const lower = eq.trim().toLowerCase();
    if (/\b(plot|graph|draw|sketch|chart|visualize)\b/.test(lower)) {
      // Try to extract a specific function from the request
      const funcMatch = eq.match(/(?:plot|graph|draw|sketch)\s+(?:the\s+)?(?:function\s+)?(?:of\s+)?(?:y\s*=\s*)?([a-z0-9^()+\-*/.\s]+)/i);
      let exprToPlot = funcMatch ? funcMatch[1].trim().replace(/[?.!]+$/, "") : null;

      // If no specific function, or it's a generic request like "plot the result", use last solved equation
      if (!exprToPlot || /^(the|this|that|it|area|result|answer|solution|function|equation|graph|plot)$/i.test(exprToPlot)) {
        if (lastSolvedEquation) {
          // Extract the LHS of the equation for plotting, or the whole expression
          const parts = lastSolvedEquation.split("=");
          exprToPlot = parts[0].trim();
        }
      }

      if (exprToPlot && /[a-z0-9]/.test(exprToPlot)) {
        setMessages((p) => [...p, {
          id: `b-${Date.now()}`, role: "bot", content: `📊 Graph of ${exprToPlot}`,
          graphExpressions: [exprToPlot],
        }]);
        return;
      }
    }

    // Open the solving overlay immediately
    openSolvingOverlay(eq);

    // If AI mode or natural language, use GPT directly — include context from last problem
    if (aiMode || /^(explain|why|how|what|find|solve|calculate|prove|show me|can you|could you|tell me|please)\b/i.test(eq.trim())) {
      addSolvingStep("Sending to AI...", "active");
      setSolvingSource("GPT-4o");

      const botId = `b-${Date.now()}`;
      setMessages((p) => [...p, { id: botId, role: "bot", content: "", claudeStream: true, isLoading: true }]);

      // Include context from last solved problem for follow-up questions
      const contextPrefix = lastSolvedEquation
        ? `Context: The previous problem was "${lastSolvedEquation}" and the answer was "${lastSolvedAnswer}". \n\nUser question: `
        : "";

      askClaudeStreaming(
        contextPrefix + eq,
        (subject as string) === "graphing" ? undefined : (subject as string),
        (chunk) => {
          setSolvingStream((prev) => prev + chunk);
          setMessages((p) => p.map((m) => m.id === botId ? { ...m, content: m.content + chunk, isLoading: false } : m));
        },
        () => {
          addSolvingStep("Solution complete", "done");
          setSolvingAnswer("See AI explanation →");
          setMessages((p) => p.map((m) => m.id === botId ? { ...m, content: cleanGPTOutput(m.content), isLoading: false } : m));
        },
        (error) => {
          addSolvingStep(`Error: ${error}`, "done");
          setMessages((p) => p.map((m) => m.id === botId ? { ...m, content: `Error: ${error}`, isLoading: false } : m));
        },
      );
      return;
    }

    // Try the solve pipeline: local → Newton → GPT
    addSolvingStep("Analyzing expression...", "active");

    try {
      const result = await solveMath(eq);

      if (result.type === "local" && result.localSolution) {
        // Local solver succeeded — show animated steps
        setSolvingSource(result.source);
        result.localSolution.steps.forEach((step) => {
          if (step.operation !== "display") {
            addSolvingStep(`${step.description}: ${step.afterEquation}`);
          }
        });
        setSolvingAnswer(result.answer);
        setLastSolvedEquation(eq);
        setLastSolvedAnswer(result.answer);
        setSolution(result.localSolution);
        setIsPlaying(true);
        setCurrentStep(0);
        setShowAnimation(true);

        setMessages((p) => [...p, {
          id: `b-${Date.now()}`, role: "bot", content: "", solution: result.localSolution, mathResult: result,
        }]);
        return;
      }

      if (result.type === "wolfram" || result.type === "newton") {
        // Check if this is a graph request
        const graphExpr = (result as any).graphExpression;
        if (graphExpr && result.source === "Graph") {
          setSolvingSource("Graph");
          addSolvingStep(`Plotting: ${graphExpr}`, "done");
          setShowSolving(false);

          setMessages((p) => [...p, {
            id: `b-${Date.now()}`, role: "bot", content: `📊 Graph of ${graphExpr}`,
            graphExpressions: [graphExpr],
          }]);
          return;
        }

        // Wolfram Alpha or Newton solved it — display their result directly (DO NOT override with GPT)
        setSolvingSource(result.source);
        (result.steps || []).forEach((s) => addSolvingStep(s));
        setSolvingAnswer(result.answer);
        setLastSolvedEquation(eq);
        setLastSolvedAnswer(result.answer);
        setShowSolving(false); // close solving overlay, show result in chat

        setMessages((p) => [...p, {
          id: `b-${Date.now()}`, role: "bot", content: "", mathResult: result,
        }]);
        return;
      }

      // All solvers failed — fall back to GPT streaming explanation
      addSolvingStep("Routing to GPT-4o for explanation...", "active");

      const botId = `b-${Date.now()}`;
      setMessages((p) => [...p, { id: botId, role: "bot", content: "", claudeStream: true, isLoading: true }]);

      askClaudeStreaming(
        `Solve this math problem step by step with complete mathematical rigor. Show every step clearly. Use LaTeX notation (wrap math in $ or $$). Double-check your answer before presenting it. If the equation has no closed-form solution, state that and provide a numerical approximation. Problem: ${eq}`,
        (subject as string) === "graphing" ? undefined : (subject as string),
        (chunk) => {
          setSolvingStream((prev) => prev + chunk);
          setMessages((p) => p.map((m) => m.id === botId ? { ...m, content: m.content + chunk, isLoading: false } : m));
        },
        () => {
          addSolvingStep("Solution complete", "done");
          setMessages((p) => p.map((m) => m.id === botId ? { ...m, content: cleanGPTOutput(m.content), isLoading: false } : m));
        },
        (error) => {
          addSolvingStep(`Error: ${error}`, "done");
          setMessages((p) => p.map((m) => m.id === botId ? { ...m, content: `Error: ${error}`, isLoading: false } : m));
        },
      );
    } catch {
      addSolvingStep("Something went wrong. Try rephrasing.", "done");
    }
  }, [aiMode, subject]);

  // ── Photo OCR result ──
  const handlePhotoResult = useCallback((expression: string) => {
    setShowPhoto(false);
    handleSolve(expression);
  }, [handleSolve]);

  const playAnimation = (sol: SolutionData) => { setSolution(sol); setCurrentStep(0); setIsPlaying(true); setShowAnimation(true); };

  const subjectLabel = subjects.find((s) => s.id === subject)?.label || "Basic Math";
  const subjectIcon = subjects.find((s) => s.id === subject)?.icon || "🔢";
  const isGraphing = subject === "graphing";
  const mathSubject: MathSubject = isGraphing ? "algebra" : (subject as MathSubject);

  // ─── GRAPHING MODE ─────────────────────────────────────────
  if (isGraphing) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gradient-to-b from-[#0f1729] to-[#1a2744]">
        <LabHeader label={subjectLabel} icon={subjectIcon} navOpen={navOpen} setNavOpen={setNavOpen} subjects={subjects} current={subject} onSelect={(s) => { setSubject(s); setNavOpen(false); }} />
        <div className="flex-1 overflow-hidden p-3">
          <PlotlyGraph
            expressions={graphExpressions.length > 0 ? graphExpressions : ["sin(x)", "cos(x)"]}
            darkMode
            className="h-full"
          />
        </div>
        <div className="px-4 py-3 border-t border-white/10 bg-white/[0.03] flex gap-2">
          <input
            type="text"
            placeholder="Enter function to graph (e.g. x^2, sin(x))..."
            className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-slate-200 text-sm placeholder-slate-500 outline-none focus:border-blue-500/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                setGraphExpressions((prev) => [...prev, e.currentTarget.value.trim()]);
                e.currentTarget.value = "";
              }
            }}
          />
          <button onClick={() => setGraphExpressions([])} className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl text-sm hover:bg-red-500/30 transition">Clear</button>
        </div>
      </div>
    );
  }

  // ─── SOLVER MODE ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gradient-to-b from-[#0f1729] to-[#1a2744] relative">
      <LabHeader label={subjectLabel} icon={subjectIcon} navOpen={navOpen} setNavOpen={setNavOpen} subjects={subjects} current={subject} onSelect={(s) => { setSubject(s); setNavOpen(false); }}
        extra={
          <div className="flex items-center gap-2">
            {/* AI Mode toggle */}
            <button
              onClick={() => setAiMode(!aiMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                aiMode ? "bg-purple-500/30 text-purple-300 border border-purple-500/40" : "bg-white/[0.06] text-slate-400 border border-white/10 hover:text-slate-200"
              }`}
            >
              <span className="text-sm">🤖</span> AI
            </button>
            {/* Camera button */}
            <button
              onClick={() => setShowPhoto(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/[0.06] text-slate-400 border border-white/10 hover:text-slate-200 transition"
            >
              <span className="text-sm">📷</span> Photo
            </button>
          </div>
        }
      />

      {/* Chat Area — text is selectable and copyable */}
      <div className="flex-1 overflow-y-auto select-text" style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent", userSelect: "text", WebkitUserSelect: "text" }}>
        <div className="px-4 py-5 flex flex-col gap-4 min-h-full justify-end max-w-4xl mx-auto w-full">
          {messages.map((msg) => (
            <div key={msg.id} className="animate-[fadeUp_.3s_ease]">
              {msg.role === "bot" ? (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-blue-500/20">S</div>
                  <div className="max-w-[85%] space-y-2">
                    {/* Loading indicator */}
                    {msg.isLoading && (
                      <div className="bg-white/[0.07] rounded-2xl rounded-tl-md px-4 py-3 border border-white/[0.06]">
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <span className="animate-spin">⏳</span> Solving...
                        </div>
                      </div>
                    )}

                    {/* Claude/GPT streaming / text content */}
                    {msg.content && !msg.isLoading && (
                      <div className="bg-white/[0.07] backdrop-blur-sm text-slate-200 text-[14px] leading-relaxed rounded-2xl rounded-tl-md px-5 py-4 border border-white/[0.06] select-text">
                        {msg.claudeStream ? (
                          <KaTeXRenderer math={msg.content} className="text-slate-200 leading-relaxed" />
                        ) : (
                          <>
                            {msg.content}
                            {msg.id === "welcome" && (
                              <span className="block mt-2 text-[12px] text-blue-400/70">💡 Try: 2x+3=7 • derive x^3 • integrate sin(x) • explain the quadratic formula</span>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Local solution with animation */}
                    {msg.solution && (
                      <div className="space-y-2">
                        <div className="bg-white/[0.07] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-4 py-3">
                          <div className="text-[10px] uppercase tracking-[1.5px] text-blue-400/60 mb-1.5 font-medium">Answer</div>
                          <div className="text-[22px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 font-mono">
                            {Object.entries(msg.solution.solution).map(([k, v]) => (k === "result" ? `${v}` : `${k} = ${v}`)).join(", ")}
                          </div>
                          {msg.mathResult && (
                            <div className="mt-2 text-[10px] text-slate-500">via {msg.mathResult.source}</div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => playAnimation(msg.solution!)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-4 py-1.5 text-[12px] hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/25 font-medium">
                            ▶ Steps Animation
                          </button>
                          <button
                            onClick={() => {
                              const id = `b-${Date.now()}`;
                              setMessages((p) => [...p, { id, role: "bot", content: "", claudeStream: true, isLoading: true }]);
                              askClaudeStreaming(
                                `Explain step by step how to solve: ${msg.solution!.originalEquation}`,
                                (subject as string) === "graphing" ? undefined : (subject as string),
                                (chunk) => { setMessages((p) => p.map((m) => m.id === id ? { ...m, content: m.content + chunk, isLoading: false } : m)); },
                                () => { setMessages((p) => p.map((m) => m.id === id ? { ...m, content: cleanGPTOutput(m.content), isLoading: false } : m)); },
                                (err) => { setMessages((p) => p.map((m) => m.id === id ? { ...m, content: `Error: ${err}`, isLoading: false } : m)); },
                              );
                            }}
                            className="bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-full px-4 py-1.5 text-[12px] hover:bg-purple-600/30 transition font-medium"
                          >
                            🤖 AI Explain
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Newton API result (no local solution) */}
                    {msg.mathResult && !msg.solution && (
                      <div className="space-y-2">
                        {/* Source badge + Wolfram link */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            {msg.mathResult.source === "Wolfram Alpha" && <span className="text-orange-400">★</span>}
                            Powered by {msg.mathResult.source}
                          </div>
                          {msg.mathResult.wolframUrl && (
                            <a href={msg.mathResult.wolframUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-orange-400/70 hover:text-orange-400 transition">
                              View on Wolfram Alpha ↗
                            </a>
                          )}
                        </div>

                        {/* Wolfram Alpha pods — ALL pods displayed */}
                        {msg.mathResult.wolframPods && msg.mathResult.wolframPods.length > 0 ? (
                          <>
                            <div className="space-y-2">
                              {msg.mathResult.wolframPods.map((pod: any, pi: number) => {
                                const isPrimary = pod.primary || pod.id === "Solution" || pod.id === "Result";
                                return (
                                  <div key={pi} className={`border rounded-xl overflow-hidden ${isPrimary ? "bg-white/[0.08] border-emerald-500/30" : "bg-white/[0.06] border-white/[0.08]"}`}>
                                    <div className={`px-4 py-2 border-b ${isPrimary ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.04] border-white/[0.06]"}`}>
                                      <div className="flex items-center gap-2">
                                        {isPrimary && <span className="text-emerald-400 text-xs">★</span>}
                                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${isPrimary ? "text-emerald-400" : "text-orange-400/80"}`}>{pod.title}</span>
                                      </div>
                                    </div>
                                    <div className="px-4 py-3">
                                      {pod.subpods?.map((sp: any, si: number) => (
                                        <div key={si} className={si > 0 ? "mt-3 pt-3 border-t border-white/[0.04]" : ""}>
                                          {sp.title && <div className="text-[10px] text-slate-500 mb-1">{sp.title}</div>}
                                          {sp.plaintext && (
                                            <div className={`font-mono select-text whitespace-pre-wrap leading-relaxed ${isPrimary ? "text-[16px] text-emerald-300" : "text-[14px] text-slate-200"}`}>
                                              {sp.plaintext}
                                            </div>
                                          )}
                                          {sp.img && (
                                            <div className="mt-2 bg-white rounded-lg p-2 inline-block max-w-full overflow-x-auto">
                                              <img src={sp.img} alt={pod.title} className="max-w-full h-auto" loading="lazy" />
                                            </div>
                                          )}
                                          {!sp.plaintext && !sp.img && (
                                            <div className="text-xs text-slate-500 italic">No data available</div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {msg.mathResult.stepByStep && (
                              <div className="bg-white/[0.04] border border-blue-500/15 rounded-xl overflow-hidden mt-2 p-4">
                                <StepByStepAnimator
                                  stepByStepText={msg.mathResult.stepByStep}
                                  originalEquation={msg.mathResult.originalQuery || msg.mathResult.answer || ""}
                                  speed={1.0}
                                  autoPlay={true}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          /* Non-Wolfram results */
                          <div className="bg-white/[0.07] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[1.5px] text-blue-400/60 mb-1.5 font-medium">Answer</div>
                            <div className="text-[20px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 font-mono select-text">
                              {msg.mathResult.answer}
                            </div>
                            {msg.mathResult.steps && msg.mathResult.steps.length > 0 && (
                              <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                                {msg.mathResult.steps.map((s, i) => (
                                  <div key={i} className="text-sm text-slate-400 font-mono select-text">{s}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Shape solution */}
                    {msg.shapeSolution && (
                      <div className="bg-white/[0.07] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-4 py-3">
                        <div className="text-[12px] font-semibold text-blue-400 mb-2">{msg.shapeSolution.title}</div>
                        {msg.shapeSolution.steps.map((step, i) => (
                          <div key={i} className={`py-1 font-mono text-[14px] leading-relaxed ${step.final ? "font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-[16px] mt-2 pt-2 border-t border-white/10" : "text-slate-300"}`}>
                            {step.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inline graph */}
                    {msg.graphExpressions && msg.graphExpressions.length > 0 && (
                      <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl overflow-hidden" style={{ height: 250 }}>
                        <PlotlyGraph expressions={msg.graphExpressions} darkMode className="h-full" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white text-[14px] rounded-2xl rounded-tr-md px-4 py-3 shadow-lg shadow-blue-500/15 border border-white/10">
                    {msg.shapeDisplay ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-2xl">{msg.shapeDisplay.icon}</span>
                        <span className="font-semibold">{msg.shapeDisplay.shapeName}</span>
                        <div className="flex flex-wrap gap-x-3 font-mono text-[13px] text-blue-100">
                          {Object.entries(msg.shapeDisplay.values).map(([k, v]) => (<span key={k}><em>{k}</em>={v}</span>))}
                        </div>
                      </div>
                    ) : (<span className="font-mono">{msg.content}</span>)}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Follow-up question input — appears after first answer */}
      {messages.length > 2 && (
        <div className="px-4 py-2 bg-[#111b2e] border-t border-white/[0.06]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.querySelector("input") as HTMLInputElement;
              if (input?.value.trim()) {
                handleSolve(input.value.trim());
                input.value = "";
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask a follow-up question..."
              className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/40 transition"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-blue-500 hover:to-indigo-500 transition flex-shrink-0"
            >
              Ask
            </button>
          </form>
        </div>
      )}

      {/* Keyboard */}
      <MathInput subject={mathSubject} onChange={setEquation} onSubmit={handleSolve} onShapeSubmit={handleShapeSubmit} inputRef={mathInputRef} />

      {/* Photo Input Overlay */}
      {showPhoto && <PhotoInput onExpressionExtracted={handlePhotoResult} onClose={() => setShowPhoto(false)} />}

      {/* "How should I answer?" Modal */}
      {showAnswerModal && pendingShape && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[88%] max-w-[360px] bg-[#1e293b] rounded-2xl overflow-hidden border border-white/10" style={{ boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600">
              <span className="font-semibold text-[15px] text-white">How should I answer?</span>
              <button onClick={() => { setShowAnswerModal(false); setPendingShape(null); }} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
            </div>
            <ul className="max-h-[280px] overflow-y-auto">
              {getCalcOptions(pendingShape.shape.name).map((opt) => (
                <li key={opt} onClick={() => handleCalcChoice(opt)} className="px-5 py-3.5 text-[14px] text-slate-300 cursor-pointer border-b border-white/5 hover:bg-white/[0.06] hover:text-white transition-colors">{opt}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Live Solving Overlay ── */}
      {showSolving && !showAnimation && (
        <div className="absolute inset-0 z-[998] flex flex-col bg-[#0f1729]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#141e33] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs animate-pulse">⚡</div>
              <span className="text-sm font-semibold text-slate-200">Solving: <span className="text-blue-400 font-mono">{solvingEquation}</span></span>
            </div>
            <div className="flex items-center gap-2">
              {solvingSource && (
                <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.06] px-2 py-1 rounded-full">{solvingSource}</span>
              )}
              <button type="button" onClick={closeSolvingOverlay}
                className="text-sm text-red-400 font-semibold hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-lg transition cursor-pointer">
                ✕ Close
              </button>
            </div>
          </div>

          {/* Split view */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* LEFT — Steps */}
            <div className="w-full md:w-[400px] flex-shrink-0 bg-[#111b2e] border-r border-white/[0.06] flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex-shrink-0">
                <h3 className="text-xs uppercase tracking-[1.5px] text-emerald-400/60 font-semibold">Solution Progress</h3>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}>
                <div className="space-y-1">
                  {solvingSteps.map((step, i) => (
                    <div key={i} className={`flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 transition-all duration-500 ${step.status === "done" ? "opacity-100" : step.status === "active" ? "opacity-90" : "opacity-30"}`}>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                        step.status === "done" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : step.status === "active" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse"
                        : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}>
                        {step.status === "done" ? "✓" : step.status === "active" ? "⏳" : i + 1}
                      </span>
                      <span className="text-sm font-mono text-slate-200 leading-relaxed">{step.text}</span>
                    </div>
                  ))}
                </div>

                {/* Final answer */}
                {solvingAnswer && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="text-[10px] uppercase tracking-[1.5px] text-emerald-400/60 font-semibold mb-2">Answer</div>
                    <div className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 font-mono">
                      {solvingAnswer}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — AI Stream or Animation */}
            <div className="flex-1 bg-[#0a1020] flex flex-col overflow-hidden">
              {solvingStream ? (
                <div className="flex-1 overflow-y-auto p-6 select-text" style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}>
                  <div className="text-[10px] uppercase tracking-[1.5px] text-blue-400/60 font-semibold mb-4">AI Step-by-Step Solution</div>
                  <div className="text-slate-200 text-[14px] leading-relaxed whitespace-pre-wrap">
                    {solvingStream.includes("$") ? (
                      <KaTeXRenderer math={solvingStream} className="text-slate-200 leading-relaxed" />
                    ) : (
                      solvingStream
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4 animate-bounce">🧮</div>
                    <p className="text-slate-400 text-sm">Processing your equation...</p>
                    <p className="text-slate-600 text-xs mt-1">Watch the steps appear on the left</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animation Overlay — split screen */}
      {showAnimation && solution && (
        <div className="absolute inset-0 z-[999] flex flex-col bg-[#0f1729]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#141e33] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">S</div>
              <span className="text-sm font-semibold text-slate-200">Step-by-Step Solution</span>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowAnimation(false); setIsPlaying(false); setSolution(null); }}
              className="flex items-center gap-1.5 text-sm text-red-400 font-semibold hover:text-red-300 transition bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-lg cursor-pointer z-[1000]">
              ✕ Close
            </button>
          </div>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-[380px] flex-shrink-0 bg-[#111b2e] border-r border-white/[0.06] flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex-shrink-0"><h3 className="text-xs uppercase tracking-[1.5px] text-blue-400/60 font-semibold">Solution Steps</h3></div>
              <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}>
                <div className="space-y-1">
                  {solution.steps.filter((s) => s.operation !== "display").map((step, i) => (
                    <div key={i} className={`flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 transition-all duration-300 ${i <= currentStep - 1 ? "opacity-100" : i === currentStep ? "opacity-80" : "opacity-25"}`}>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${i < currentStep ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : i === currentStep ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                        {i < currentStep ? "✓" : i + 1}
                      </span>
                      <div className="flex flex-col gap-0.5"><span className="text-[11px] text-slate-500">{step.description}</span><span className="text-base font-mono font-semibold text-slate-200">{step.afterEquation}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 bg-[#0a1020] p-3 overflow-hidden">
              <VisualizationEngine steps={solution.steps} isPlaying={isPlaying} playbackSpeed={playbackSpeed} currentStep={currentStep} onStepChange={setCurrentStep} />
            </div>
          </div>
          <div className="px-4 py-3 border-t border-white/10 bg-[#141e33] flex-shrink-0">
            <PlaybackControls isPlaying={isPlaying} playbackSpeed={playbackSpeed} onPlayPause={() => setIsPlaying(!isPlaying)} onSpeedChange={setPlaybackSpeed} onReset={() => { setCurrentStep(0); setIsPlaying(true); }} currentStep={currentStep} totalSteps={solution.steps.length} />
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .katex-display-block {
          margin: 12px 0;
          padding: 12px 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.05);
          overflow-x: auto;
        }
        .katex-display-block .katex-display {
          margin: 0;
        }
        .katex-renderer p {
          margin: 6px 0;
        }
        .katex-renderer .katex {
          font-size: 1.05em;
        }
        .katex-renderer .katex-display .katex {
          font-size: 1.15em;
        }
      `}</style>
    </div>
  );
};

// ─── Header ──────────────────────────────────────────────────
function LabHeader({ label, icon, navOpen, setNavOpen, subjects, current, onSelect, extra }: {
  label: string; icon: string; navOpen: boolean; setNavOpen: (v: boolean) => void;
  subjects: { id: SubjectOrGraphing; label: string; icon: string; iconSvg?: string }[];
  current: SubjectOrGraphing; onSelect: (s: SubjectOrGraphing) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex-shrink-0 bg-white/[0.03] border-b border-white/[0.08] relative" style={{ zIndex: 200 }}>
      <div className="h-[54px] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-[4px] cursor-pointer p-1.5 hover:bg-white/10 rounded-lg transition" onClick={() => setNavOpen(!navOpen)}>
            <span className={`block w-5 h-[2px] bg-slate-400 rounded transition-transform ${navOpen ? "rotate-45 translate-y-[6px]" : ""}`} />
            <span className={`block w-5 h-[2px] bg-slate-400 rounded transition-opacity ${navOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-[2px] bg-slate-400 rounded transition-transform ${navOpen ? "-rotate-45 -translate-y-[6px]" : ""}`} />
          </div>
          <div className="flex items-center gap-2 bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/[0.08]">
            <span className="text-sm">{icon}</span>
            <span className="text-[13px] text-slate-300 font-medium">{label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-500/20">S</div>
          <div><span className="text-[18px] font-bold text-white tracking-tight">MathLab</span><span className="text-[9px] text-slate-500 block text-right -mt-[2px] tracking-wider">SCHOOLFLOW</span></div>
        </div>
        <div className="flex items-center gap-2">
          {extra}
        </div>
      </div>
      {navOpen && (
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setNavOpen(false)} />
          <nav className="absolute top-[54px] left-0 w-[240px] bg-[#1e293b] border border-white/10 z-[500] rounded-b-xl overflow-hidden" style={{ boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>
            {subjects.map((s) => (
              <button key={s.id} onClick={() => onSelect(s.id)}
                className={`flex items-center gap-3 w-full text-left px-4 py-3 text-[13px] border-b border-white/[0.04] transition-all ${current === s.id ? "text-white bg-blue-600/20 font-semibold" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}>
                <SubjectIcon type={s.iconSvg} size={22} />{s.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

export default LabsPage;
