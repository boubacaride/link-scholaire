"use client";

import { useEffect, useRef } from "react";
import { useHuman } from "@/contexts/HumanContext";
import type { ViewerUIOptions } from "@/lib/biodigital/types";

interface ViewerProps {
  modelId: string;
  developerKey: string;
  uiOptions?: ViewerUIOptions;
  className?: string;
}

function buildViewerUrl(modelId: string, dk: string, opts: ViewerUIOptions = {}): string {
  const params = new URLSearchParams();
  params.set("m", modelId);
  params.set("dk", dk);

  // Default UI options
  const defaults: ViewerUIOptions = {
    "ui-tools": true,
    "ui-search": true,
    "ui-info": true,
    "ui-fullscreen": true,
    "ui-anatomy-labels": true,
    "ui-anatomy-descriptions": true,
    "ui-nav": true,
    "ui-reset": true,
  };

  const merged = { ...defaults, ...opts };
  for (const [key, val] of Object.entries(merged)) {
    if (val !== undefined) params.set(key, String(val));
  }

  return `https://human.biodigital.com/widget/?${params.toString()}`;
}

const IFRAME_ID = "biodigital-viewer";

export default function Viewer({ modelId, developerKey, uiOptions, className = "" }: ViewerProps) {
  const { initViewer } = useHuman();
  const initRef = useRef(false);

  const src = buildViewerUrl(modelId, developerKey, uiOptions);

  useEffect(() => {
    // Try initializing the HumanAPI after iframe loads
    // Use a delay to ensure the iframe content is ready
    if (initRef.current) return;
    initRef.current = true;

    const timer = setTimeout(() => {
      initViewer(IFRAME_ID).catch(() => {
        // HumanAPI init might fail if script can't load — viewer still works as iframe
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [initViewer]);

  return (
    <iframe
      id={IFRAME_ID}
      key={modelId}
      src={src}
      className={`w-full h-full border-none ${className}`}
      allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking"
      allowFullScreen
      title={`BioDigital Human - ${modelId}`}
    />
  );
}
