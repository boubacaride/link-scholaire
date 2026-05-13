"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import MathInput from "@/components/labs/MathInput";

interface Expression {
  id: string;
  text: string;
  color: string;
}

const COLORS = ["#1a3a6b", "#c0392b", "#27ae60", "#8e44ad", "#e67e22", "#2980b9"];

// ─── Safe math evaluator ───────────────────────────────────────
function evaluateExpr(expr: string, x: number): number | null {
  try {
    let e = expr.trim();
    e = e.replace(/^[yf]\s*\(?\s*x?\s*\)?\s*=\s*/i, "");
    e = e.replace(/\bsin\b/g, "Math.sin");
    e = e.replace(/\bcos\b/g, "Math.cos");
    e = e.replace(/\btan\b/g, "Math.tan");
    e = e.replace(/\bsqrt\b/g, "Math.sqrt");
    e = e.replace(/\babs\b/g, "Math.abs");
    e = e.replace(/\bln\b/g, "Math.log");
    e = e.replace(/\blog\b/g, "(Math.log10||function(v){return Math.log(v)/Math.LN10})");
    e = e.replace(/\bpi\b/gi, "Math.PI");
    e = e.replace(/π/g, "Math.PI");
    e = e.replace(/(?<![.])\be\b(?![\w(])/g, "Math.E");
    e = e.replace(/(\d)([a-zA-Z(])/g, "$1*$2");
    e = e.replace(/\)(\d|[a-zA-Z(])/g, ")*$1");
    e = e.replace(/\^/g, "**");
    const fn = new Function("x", `"use strict"; try { return (${e}); } catch { return NaN; }`);
    const result = fn(x);
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

interface GraphingCalculatorProps {
  className?: string;
}

export default function GraphingCalculator({ className = "" }: GraphingCalculatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expressions, setExpressions] = useState<Expression[]>([
    { id: "1", text: "", color: COLORS[0] },
  ]);
  const [activeExprId, setActiveExprId] = useState("1");
  const [scale, setScale] = useState(40);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const addExpression = () => {
    if (expressions.length >= 6) return;
    const newId = Date.now().toString();
    setExpressions((prev) => [
      ...prev,
      { id: newId, text: "", color: COLORS[prev.length % COLORS.length] },
    ]);
    setActiveExprId(newId);
  };

  const updateExpression = (id: string, text: string) => {
    setExpressions((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeExpression = (id: string) => {
    if (expressions.length <= 1) {
      updateExpression(id, "");
      return;
    }
    setExpressions((prev) => {
      const filtered = prev.filter((e) => e.id !== id);
      if (activeExprId === id && filtered.length > 0) {
        setActiveExprId(filtered[0].id);
      }
      return filtered;
    });
  };

  // When keyboard types, update the active expression
  const handleKeyboardChange = useCallback((text: string) => {
    if (activeExprId) {
      updateExpression(activeExprId, text);
    }
  }, [activeExprId]);

  // When keyboard submits (enter), add a new expression
  const handleKeyboardSubmit = useCallback(() => {
    addExpression();
  }, [expressions.length]);

  const activeExpr = expressions.find((e) => e.id === activeExprId);

  const zoomIn = () => setScale((s) => Math.min(s * 1.3, 200));
  const zoomOut = () => setScale((s) => Math.max(s / 1.3, 5));
  const resetView = () => { setScale(40); setOffsetX(0); setOffsetY(0); };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  };
  const handleMouseUp = () => setDragging(false);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      return Math.min(Math.max(s * factor, 5), 200);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ─── Render graph ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2 + offsetX;
    const cy = h / 2 + offsetY;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    let gridStep = 1;
    if (scale < 15) gridStep = 5;
    if (scale < 8) gridStep = 10;
    if (scale > 80) gridStep = 0.5;
    if (scale > 150) gridStep = 0.25;
    const pxStep = gridStep * scale;

    const startGridX = Math.floor((-cx) / pxStep) * pxStep;
    for (let px = startGridX; px < w - cx + pxStep; px += pxStep) {
      const screenX = cx + px;
      if (screenX < 0 || screenX > w) continue;
      ctx.beginPath(); ctx.moveTo(screenX, 0); ctx.lineTo(screenX, h); ctx.stroke();
    }
    const startGridY = Math.floor((-cy) / pxStep) * pxStep;
    for (let py = startGridY; py < h - cy + pxStep; py += pxStep) {
      const screenY = cy + py;
      if (screenY < 0 || screenY > h) continue;
      ctx.beginPath(); ctx.moveTo(0, screenY); ctx.lineTo(w, screenY); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1.5;
    if (cy >= 0 && cy <= h) { ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke(); }
    if (cx >= 0 && cx <= w) { ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke(); }

    // Labels
    ctx.fillStyle = "#888";
    ctx.font = "11px var(--font-montserrat), system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let px = startGridX; px < w - cx + pxStep; px += pxStep) {
      const val = Math.round((px / scale) * 100) / 100;
      if (val === 0) continue;
      const screenX = cx + px;
      if (screenX < 20 || screenX > w - 20) continue;
      ctx.fillText(String(val), screenX, cy + 4);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let py = startGridY; py < h - cy + pxStep; py += pxStep) {
      const val = Math.round((-py / scale) * 100) / 100;
      if (val === 0) continue;
      const screenY = cy + py;
      if (screenY < 15 || screenY > h - 15) continue;
      ctx.fillText(String(val), cx - 6, screenY);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    if (cx > 15 && cy < h - 15) ctx.fillText("0", cx - 6, cy + 4);

    // Plot
    expressions.forEach((expr) => {
      if (!expr.text.trim()) return;
      ctx.strokeStyle = expr.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let drawing = false;
      for (let px = 0; px < w; px += 1) {
        const mathX = (px - cx) / scale;
        const mathY = evaluateExpr(expr.text, mathX);
        if (mathY === null) { drawing = false; continue; }
        const screenY = cy - mathY * scale;
        if (screenY < -h * 2 || screenY > h * 3) { drawing = false; continue; }
        if (!drawing) { ctx.moveTo(px, screenY); drawing = true; } else { ctx.lineTo(px, screenY); }
      }
      ctx.stroke();
    });
  }, [expressions, scale, offsetX, offsetY]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Top: sidebar + canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-[260px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
            <div className="px-3 py-2 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Equations
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {expressions.map((expr) => (
                <div
                  key={expr.id}
                  onClick={() => setActiveExprId(expr.id)}
                  className={`flex items-center gap-2 border rounded-lg px-2 py-1.5 cursor-pointer transition ${
                    activeExprId === expr.id
                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: expr.color }} />
                  <input
                    type="text"
                    value={expr.text}
                    onChange={(e) => updateExpression(expr.id, e.target.value)}
                    onFocus={() => setActiveExprId(expr.id)}
                    placeholder="y = "
                    spellCheck={false}
                    className="flex-1 bg-transparent border-none outline-none text-[15px] font-mono text-gray-800 placeholder-gray-300"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeExpression(expr.id); }}
                    className="text-gray-300 hover:text-red-500 text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addExpression}
              className="mx-2 mb-2 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-blue-500 font-medium hover:bg-blue-50 transition"
            >
              + Add expression
            </button>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ display: "block" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
            <button onClick={zoomIn} className="w-10 h-10 rounded-full bg-blue-800 text-white flex items-center justify-center text-xl font-bold shadow-lg hover:bg-blue-900 transition">+</button>
            <button onClick={resetView} className="w-10 h-10 rounded-full bg-blue-800 text-white flex items-center justify-center text-base shadow-lg hover:bg-blue-900 transition">↺</button>
            <button onClick={zoomOut} className="w-10 h-10 rounded-full bg-blue-800 text-white flex items-center justify-center text-xl font-bold shadow-lg hover:bg-blue-900 transition">−</button>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute top-1/2 left-0 -translate-y-1/2 w-5 h-12 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md flex items-center justify-center text-gray-500 text-xs hover:bg-gray-200 transition"
          >
            {sidebarOpen ? "‹" : "›"}
          </button>
        </div>
      </div>

      {/* Bottom: Math keyboard */}
      <MathInput
        subject="algebra"
        value={activeExpr?.text || ""}
        onChange={handleKeyboardChange}
        onSubmit={handleKeyboardSubmit}
      />
    </div>
  );
}
