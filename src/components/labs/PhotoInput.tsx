"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";

interface PhotoInputProps {
  onExpressionExtracted: (expression: string) => void;
  onClose: () => void;
}

export default function PhotoInput({
  onExpressionExtracted,
  onClose,
}: PhotoInputProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Handle file selection ───────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      setFile(selected);
      setResult(null);
      setError(null);

      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(selected);
    },
    []
  );

  // ─── Extract math via OCR ────────────────────────────────────
  const handleExtract = useCallback(async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/math/ocr", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.error || `OCR request failed (${response.status})`
        );
      }

      const data = await response.json();
      const expression = data.expression || data.result || data.text;

      if (!expression) {
        throw new Error("No math expression found in the image");
      }

      setResult(expression);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to extract math"
      );
    } finally {
      setLoading(false);
    }
  }, [file]);

  // ─── Use the extracted result ────────────────────────────────
  const handleUse = useCallback(() => {
    if (result) {
      onExpressionExtracted(result);
    }
  }, [result, onExpressionExtracted]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-[#0d1528] border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-slate-100">
            Scan Math from Photo
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* File input area */}
          {!preview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-slate-600 hover:border-cyan-500/50 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors cursor-pointer group"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-500 group-hover:text-cyan-400 transition-colors"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                Tap to take a photo or upload an image
              </span>
            </button>
          ) : (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900">
              <Image
                src={preview}
                alt="Math problem preview"
                fill
                className="object-contain"
              />
              <button
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                  setResult(null);
                  setError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
                aria-label="Remove image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Error message */}
          {error && (
            <div className="px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Extracted result */}
          {result && (
            <div className="px-4 py-3 bg-cyan-900/20 border border-cyan-700/40 rounded-lg">
              <p className="text-xs text-cyan-400 mb-1 font-medium">
                Extracted expression:
              </p>
              <p className="text-base text-slate-100 font-mono break-all">
                {result}
              </p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center gap-3 py-3">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-400">
                Extracting math from image...
              </span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700/50 bg-slate-900/30">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>

          {result ? (
            <button
              onClick={handleUse}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
            >
              Use This
            </button>
          ) : (
            <button
              onClick={handleExtract}
              disabled={!file || loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {loading ? "Extracting..." : "Extract Math"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
