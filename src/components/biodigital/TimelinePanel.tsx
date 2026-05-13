"use client";

import { useState, useEffect } from "react";
import { useHuman } from "@/contexts/HumanContext";
import type { ChapterInfo } from "@/lib/biodigital/types";

export default function TimelinePanel() {
  const { services, ready } = useHuman();
  const [playing, setPlaying] = useState(false);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!services || !ready) return;
    services.timeline.getChapters().then(setChapters).catch(() => {});
  }, [services, ready]);

  if (!services || !ready) return null;
  const { timeline } = services;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Timeline</p>
      <div className="flex gap-1.5">
        <button onClick={() => { timeline.prevChapter(); }} className="btn-panel flex-1">⏮ Prev</button>
        <button
          onClick={() => { playing ? timeline.pause() : timeline.play(); setPlaying(!playing); }}
          className={playing ? "btn-panel-active flex-1" : "btn-panel flex-1"}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button onClick={() => { timeline.nextChapter(); }} className="btn-panel flex-1">Next ⏭</button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Speed:</span>
        {[0.5, 1, 2].map((s) => (
          <button
            key={s}
            onClick={() => { timeline.setSpeed(s); setSpeed(s); }}
            className={speed === s ? "btn-panel-active text-[10px] px-2" : "btn-panel text-[10px] px-2"}
          >
            {s}×
          </button>
        ))}
      </div>
      {chapters.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          <p className="text-[9px] text-gray-400">Chapters:</p>
          {chapters.map((ch) => (
            <button key={ch.chapterId} onClick={() => timeline.goToChapter(ch.chapterId)}
              className="w-full text-left text-[11px] text-gray-600 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded transition truncate">
              {ch.index + 1}. {ch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
