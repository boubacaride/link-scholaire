"use client";

interface Props {
  isPlaying: boolean;
  playbackSpeed: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  currentStep: number;
  totalSteps: number;
}

export default function PlaybackControls({
  isPlaying,
  playbackSpeed,
  onPlayPause,
  onSpeedChange,
  onReset,
  currentStep,
  totalSteps,
}: Props) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
      <button
        onClick={onPlayPause}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition text-lg"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      <button
        onClick={onReset}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition text-sm"
      >
        ↺
      </button>

      {/* Progress bar */}
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: totalSteps > 0 ? `${((currentStep + 1) / totalSteps) * 100}%` : "0%" }}
        />
      </div>

      <span className="text-xs text-gray-500 min-w-[60px] text-center">
        {currentStep + 1} / {totalSteps}
      </span>

      {/* Speed selector */}
      <select
        value={playbackSpeed}
        onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={1.5}>1.5x</option>
        <option value={2}>2x</option>
      </select>
    </div>
  );
}
