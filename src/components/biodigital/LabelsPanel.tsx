"use client";

import { useState } from "react";
import { useHuman } from "@/contexts/HumanContext";

export default function LabelsPanel() {
  const { services, ready } = useHuman();
  const [labelsVisible, setLabelsVisible] = useState(true);

  if (!services || !ready) return null;
  const { labels } = services;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Labels</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => { labelsVisible ? labels.hideAll() : labels.showAll(); setLabelsVisible(!labelsVisible); }}
          className={labelsVisible ? "btn-panel-active" : "btn-panel"}
        >
          {labelsVisible ? "Hide Labels" : "Show Labels"}
        </button>
        <button onClick={() => labels.removeAll()} className="btn-panel">Remove All</button>
      </div>
    </div>
  );
}
