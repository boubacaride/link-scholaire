// Loads the BioDigital HumanAPI script once and resolves when ready

const HUMAN_API_URL = "https://developer.biodigital.com/builds/api/human-api-3.0.0.min.js";

let loadPromise: Promise<void> | null = null;

export function loadHumanAPI(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Already loaded
    if (typeof window !== "undefined" && window.HumanAPI) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = HUMAN_API_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load BioDigital HumanAPI SDK"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
