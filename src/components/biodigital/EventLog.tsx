"use client";

import { useState, useEffect, useRef } from "react";
import { useHuman } from "@/contexts/HumanContext";

interface LogEntry {
  time: string;
  event: string;
  data: string;
}

export default function EventLog() {
  const { api, ready } = useHuman();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;

    const addLog = (event: string) => (data: any) => {
      const entry: LogEntry = {
        time: new Date().toLocaleTimeString(),
        event,
        data: JSON.stringify(data).slice(0, 120),
      };
      setLogs((prev) => [...prev.slice(-50), entry]);
    };

    const events = [
      "camera.updated",
      "scene.objectSelected",
      "scene.objectDeselected",
      "input.picked",
      "timeline.updated",
      "timeline.chapterChanged",
      "labels.created",
      "labels.removed",
      "human.modelLoaded",
      "human.error",
    ];

    events.forEach((evt) => api.on(evt, addLog(evt)));
    return () => events.forEach((evt) => api.off(evt));
  }, [api, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (!ready) return null;

  return (
    <div className="space-y-1">
      <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold hover:text-gray-600 transition">
        Event Log ({logs.length}) {expanded ? "▼" : "▶"}
      </button>
      {expanded && (
        <div className="bg-gray-900 rounded-lg p-2 max-h-40 overflow-y-auto font-mono text-[9px]" style={{ scrollbarWidth: "thin" }}>
          {logs.length === 0 && <p className="text-gray-600">No events yet...</p>}
          {logs.map((log, i) => (
            <div key={i} className="text-gray-400">
              <span className="text-gray-600">{log.time}</span>{" "}
              <span className="text-amber-400">{log.event}</span>{" "}
              <span className="text-gray-500">{log.data}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
