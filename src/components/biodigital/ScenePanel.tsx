"use client";

import { useState } from "react";
import { useHuman } from "@/contexts/HumanContext";

export default function ScenePanel() {
  const { services, ready } = useHuman();
  const [xrayOn, setXrayOn] = useState(false);

  if (!services || !ready) return null;
  const { scene } = services;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Scene Controls</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => { scene.xray(!xrayOn); setXrayOn(!xrayOn); }}
          className={xrayOn ? "btn-panel-active" : "btn-panel"}
        >
          {xrayOn ? "X-Ray ON" : "X-Ray"}
        </button>
        <button onClick={() => scene.dissect()} className="btn-panel">Dissect</button>
        <button onClick={() => scene.undissect()} className="btn-panel">Undissect</button>
        <button onClick={() => scene.unisolate()} className="btn-panel">Show All</button>
        <button onClick={() => scene.unhighlightAll()} className="btn-panel">Clear HL</button>
        <button onClick={() => scene.resetColors()} className="btn-panel">Reset Colors</button>
        <button onClick={() => scene.resetScene()} className="btn-panel col-span-2">Reset Scene</button>
      </div>
    </div>
  );
}
