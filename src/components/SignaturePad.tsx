"use client";

// Lightweight canvas signature pad (mouse + touch via pointer events). Emits a
// PNG data URL on each stroke end, or null when empty/cleared. No dependencies.

import { useEffect, useRef, useState } from "react";

interface Props {
  onChange: (dataUrl: string | null) => void;
  clearLabel?: string;
  className?: string;
}

const SignaturePad = ({ onChange, clearLabel = "Clear", className = "" }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const emptyRef = useRef(true);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2937";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (emptyRef.current) { emptyRef.current = false; setEmpty(false); }
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(emptyRef.current ? null : canvasRef.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    emptyRef.current = true;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full h-[150px] bg-white border border-gray-300 rounded-md touch-none cursor-crosshair"
      />
      <div className="flex justify-end mt-1">
        <button type="button" onClick={clear} disabled={empty} className="text-[11px] text-gray-500 hover:underline disabled:opacity-40">
          {clearLabel}
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
