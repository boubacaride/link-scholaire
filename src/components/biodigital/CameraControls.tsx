"use client";

import { useHuman } from "@/contexts/HumanContext";

export default function CameraControls() {
  const { services, ready } = useHuman();
  if (!services || !ready) return null;

  const { camera } = services;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Camera</p>
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => camera.orbit({ yaw: -30 })} className="btn-panel">← Rotate</button>
        <button onClick={() => camera.reset()} className="btn-panel">Reset</button>
        <button onClick={() => camera.orbit({ yaw: 30 })} className="btn-panel">Rotate →</button>
        <button onClick={() => camera.orbit({ pitch: 15 })} className="btn-panel">↑ Tilt</button>
        <button onClick={() => camera.zoom({ delta: 20 })} className="btn-panel">Zoom +</button>
        <button onClick={() => camera.orbit({ pitch: -15 })} className="btn-panel">↓ Tilt</button>
        <button onClick={() => camera.pan({ x: -20 })} className="btn-panel">← Pan</button>
        <button onClick={() => camera.zoom({ delta: -20 })} className="btn-panel">Zoom −</button>
        <button onClick={() => camera.pan({ x: 20 })} className="btn-panel">Pan →</button>
      </div>
    </div>
  );
}
