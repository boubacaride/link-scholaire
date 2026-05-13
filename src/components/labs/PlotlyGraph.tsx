"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 bg-[#0a1020] text-slate-400 rounded-lg">
      Loading graph...
    </div>
  ),
});

interface PlotlyGraphProps {
  expressions: string[];
  xRange?: [number, number];
  yRange?: [number, number];
  mode?: "2d" | "3d";
  className?: string;
  darkMode?: boolean;
}

const COLORS = [
  "#00d2d3",
  "#ff6b6b",
  "#48dbfb",
  "#feca57",
  "#ff9ff3",
  "#54a0ff",
];

// ─── Safe expression evaluator ───────────────────────────────────
function prepareExpression(expr: string): string {
  let e = expr.trim();

  // Strip leading y= or f(x)= style prefixes
  e = e.replace(/^[yf]\s*\(?\s*[xy]?\s*\)?\s*=\s*/i, "");

  // Caret to exponent
  e = e.replace(/\^/g, "**");

  // Trig and math functions → Math.*
  e = e.replace(/\bsin\b/g, "Math.sin");
  e = e.replace(/\bcos\b/g, "Math.cos");
  e = e.replace(/\btan\b/g, "Math.tan");
  e = e.replace(/\bsqrt\b/g, "Math.sqrt");
  e = e.replace(/\babs\b/g, "Math.abs");
  e = e.replace(/\bln\b/g, "Math.log");
  e = e.replace(/\blog\b/g, "Math.log10");

  // Constants
  e = e.replace(/\bpi\b/gi, "Math.PI");
  e = e.replace(/π/g, "Math.PI");
  // 'e' as Euler's number — standalone only (not inside identifiers like Math.exp)
  e = e.replace(/(?<![.\w])e(?![\w(])/g, "Math.E");

  // Implicit multiplication: 2x → 2*x, )x → )*x, 3( → 3*(
  e = e.replace(/(\d)([a-zA-Z(])/g, "$1*$2");
  e = e.replace(/\)(\d|[a-zA-Z(])/g, ")*$1");

  return e;
}

function evaluateExpr(expr: string, x: number): number | null {
  try {
    const prepared = prepareExpression(expr);
    const fn = new Function("x", `"use strict"; return (${prepared});`);
    const val = fn(x);
    if (typeof val !== "number" || !isFinite(val)) return null;
    return val;
  } catch {
    return null;
  }
}

function evaluateExpr3D(
  expr: string,
  x: number,
  y: number
): number | null {
  try {
    let prepared = prepareExpression(expr);
    // For 3D, also handle 'y' as a variable
    const fn = new Function(
      "x",
      "y",
      `"use strict"; return (${prepared});`
    );
    const val = fn(x, y);
    if (typeof val !== "number" || !isFinite(val)) return null;
    return val;
  } catch {
    return null;
  }
}

// ─── Generate plot data ──────────────────────────────────────────
function generate2DTraces(
  expressions: string[],
  xRange: [number, number]
) {
  const numPoints = 500;
  const step = (xRange[1] - xRange[0]) / numPoints;
  const xValues: number[] = [];

  for (let i = 0; i <= numPoints; i++) {
    xValues.push(xRange[0] + i * step);
  }

  return expressions.map((expr, idx) => {
    const yValues = xValues.map((x) => evaluateExpr(expr, x));

    return {
      x: xValues,
      y: yValues,
      type: "scatter" as const,
      mode: "lines" as const,
      name: expr,
      line: {
        color: COLORS[idx % COLORS.length],
        width: 2.5,
      },
      connectgaps: false,
    };
  });
}

function generate3DTrace(
  expression: string,
  xRange: [number, number],
  yRange: [number, number],
  colorIdx: number
) {
  const resolution = 50;
  const xStep = (xRange[1] - xRange[0]) / resolution;
  const yStep = (yRange[1] - yRange[0]) / resolution;

  const xValues: number[] = [];
  const yValues: number[] = [];
  const zValues: number[][] = [];

  for (let i = 0; i <= resolution; i++) {
    xValues.push(xRange[0] + i * xStep);
  }
  for (let j = 0; j <= resolution; j++) {
    yValues.push(yRange[0] + j * yStep);
  }

  for (let j = 0; j <= resolution; j++) {
    const row: number[] = [];
    for (let i = 0; i <= resolution; i++) {
      const val = evaluateExpr3D(expression, xValues[i], yValues[j]);
      row.push(val ?? NaN);
    }
    zValues.push(row);
  }

  return {
    x: xValues,
    y: yValues,
    z: zValues,
    type: "surface" as const,
    name: expression,
    colorscale: [
      [0, COLORS[colorIdx % COLORS.length]],
      [1, COLORS[(colorIdx + 1) % COLORS.length]],
    ] as [number, string][],
    opacity: 0.85,
    showscale: false,
  };
}

// ─── Dark theme layout ───────────────────────────────────────────
function buildLayout(
  mode: "2d" | "3d",
  darkMode: boolean,
  xRange: [number, number],
  yRange?: [number, number]
) {
  const bg = darkMode ? "#0a1020" : "#ffffff";
  const gridColor = darkMode ? "#1a2744" : "#e5e7eb";
  const textColor = darkMode ? "#94a3b8" : "#374151";
  const zeroLineColor = darkMode ? "#334155" : "#9ca3af";

  const baseLayout: Record<string, unknown> = {
    paper_bgcolor: bg,
    plot_bgcolor: bg,
    font: { color: textColor, family: "Inter, system-ui, sans-serif" },
    margin: { t: 20, r: 20, b: 40, l: 50 },
    legend: {
      font: { color: textColor },
      bgcolor: "transparent",
      x: 0.01,
      y: 0.99,
    },
    autosize: true,
  };

  if (mode === "2d") {
    baseLayout.xaxis = {
      range: xRange,
      gridcolor: gridColor,
      zerolinecolor: zeroLineColor,
      zerolinewidth: 1.5,
      tickfont: { color: textColor },
    };
    baseLayout.yaxis = {
      gridcolor: gridColor,
      zerolinecolor: zeroLineColor,
      zerolinewidth: 1.5,
      tickfont: { color: textColor },
      scaleanchor: undefined,
    };
    if (yRange) {
      (baseLayout.yaxis as Record<string, unknown>).range = yRange;
    }
  } else {
    baseLayout.scene = {
      xaxis: { gridcolor: gridColor, backgroundcolor: bg, color: textColor },
      yaxis: { gridcolor: gridColor, backgroundcolor: bg, color: textColor },
      zaxis: { gridcolor: gridColor, backgroundcolor: bg, color: textColor },
      bgcolor: bg,
    };
  }

  return baseLayout;
}

// ─── Component ───────────────────────────────────────────────────
export default function PlotlyGraph({
  expressions,
  xRange = [-10, 10],
  yRange,
  mode = "2d",
  className = "",
  darkMode = true,
}: PlotlyGraphProps) {
  const { data, layout } = useMemo(() => {
    const effectiveYRange = yRange ?? xRange;

    let traces: Record<string, unknown>[];

    if (mode === "2d") {
      traces = generate2DTraces(expressions, xRange);
    } else {
      traces = expressions.map((expr, idx) =>
        generate3DTrace(expr, xRange, effectiveYRange, idx)
      );
    }

    const plotLayout = buildLayout(mode, darkMode, xRange, yRange);

    return { data: traces, layout: plotLayout };
  }, [expressions, xRange, yRange, mode, darkMode]);

  if (!expressions.length) {
    return (
      <div
        className={`flex items-center justify-center h-64 bg-[#0a1020] text-slate-500 rounded-lg ${className}`}
      >
        Enter an expression to graph
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <Plot
        data={data as any[]}
        layout={layout as any}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ["toImage", "sendDataToCloud"],
          displaylogo: false,
        }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
