// Voice narration engine: Browser SpeechSynthesis with ElevenLabs upgrade path
// Syncs voice with animation timeline

import type { Level } from "./levelDetector";

export interface VoiceConfig {
  enabled: boolean;
  rate: number;       // speech rate multiplier
  pitch: number;      // 0-2
  volume: number;     // 0-1
  lang: string;       // "en-US", "fr-FR", "ar-SA"
  voiceName?: string; // preferred voice name
}

const LEVEL_VOICE_DEFAULTS: Record<Level, Partial<VoiceConfig>> = {
  "K-2":       { rate: 0.8, pitch: 1.2, volume: 1.0 },   // slow, higher pitch
  "3-5":       { rate: 0.85, pitch: 1.1, volume: 1.0 },
  "6-8":       { rate: 0.9, pitch: 1.0, volume: 0.9 },
  "9-10":      { rate: 1.0, pitch: 1.0, volume: 0.8 },
  "11-12":     { rate: 1.0, pitch: 1.0, volume: 0.8 },
  "undergrad": { rate: 1.1, pitch: 0.95, volume: 0.7 },
  "grad":      { rate: 1.2, pitch: 0.9, volume: 0.7 },
};

class VoiceNarrator {
  private synth: SpeechSynthesis | null = null;
  private config: VoiceConfig;
  private queue: string[] = [];
  private isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor(config?: Partial<VoiceConfig>) {
    this.config = {
      enabled: true,
      rate: 0.9,
      pitch: 1.0,
      volume: 0.9,
      lang: "en-US",
      ...config,
    };

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
    }
  }

  /** Update config (e.g., when level changes) */
  setConfig(updates: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** Apply level-specific voice defaults */
  setLevel(level: Level): void {
    const defaults = LEVEL_VOICE_DEFAULTS[level];
    this.setConfig(defaults);
  }

  /** Speak text immediately (cancels current speech) */
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.config.enabled || !this.synth || !text.trim()) {
        resolve();
        return;
      }

      // Clean text for speech — remove LaTeX, special chars
      const cleanText = this.cleanForSpeech(text);
      if (!cleanText) { resolve(); return; }

      // Cancel any current speech
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = this.config.rate;
      utterance.pitch = this.config.pitch;
      utterance.volume = this.config.volume;
      utterance.lang = this.config.lang;

      // Try to find a good voice
      const voices = this.synth.getVoices();
      const preferred = this.findBestVoice(voices);
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        resolve();
      };
      utterance.onerror = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        resolve();
      };

      this.currentUtterance = utterance;
      this.isSpeaking = true;
      this.synth.speak(utterance);
    });
  }

  /** Queue text to speak after current speech finishes */
  enqueue(text: string): void {
    this.queue.push(text);
    if (!this.isSpeaking) this.processQueue();
  }

  /** Process the speech queue */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const text = this.queue.shift();
      if (text) await this.speak(text);
    }
  }

  /** Stop all speech */
  stop(): void {
    this.queue = [];
    this.synth?.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  /** Pause current speech */
  pause(): void {
    this.synth?.pause();
  }

  /** Resume paused speech */
  resume(): void {
    this.synth?.resume();
  }

  /** Check if currently speaking */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** Check if voice is available */
  get available(): boolean {
    return this.synth !== null;
  }

  /** Clean text for speech — remove LaTeX notation */
  private cleanForSpeech(text: string): string {
    return text
      .replace(/\$\$[^$]*\$\$/g, "")          // remove display math
      .replace(/\$[^$]*\$/g, "")               // remove inline math
      .replace(/\\[a-zA-Z]+/g, "")             // remove LaTeX commands
      .replace(/[{}^_\\]/g, "")                // remove LaTeX chars
      .replace(/\s+/g, " ")                    // collapse spaces
      .replace(/[#*]+/g, "")                   // remove markdown
      .replace(/STEP\s*\d+[:.]\s*/gi, "Step ") // clean step labels
      .replace(/[📝📊🎯🎉✓✨★∴∎]/g, "")       // remove emoji
      .trim();
  }

  /** Find the best voice for the current language */
  private findBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (voices.length === 0) return null;

    // Try preferred voice name
    if (this.config.voiceName) {
      const named = voices.find((v) => v.name.includes(this.config.voiceName!));
      if (named) return named;
    }

    const lang = this.config.lang;

    // Prefer high-quality voices
    const premium = voices.filter((v) =>
      v.lang.startsWith(lang.split("-")[0]!) &&
      (v.name.includes("Premium") || v.name.includes("Enhanced") || v.name.includes("Neural") || v.name.includes("Google"))
    );
    if (premium.length > 0) return premium[0]!;

    // Any voice matching the language
    const matching = voices.filter((v) => v.lang.startsWith(lang.split("-")[0]!));
    if (matching.length > 0) return matching[0]!;

    // Default voice
    const defaultVoice = voices.find((v) => v.default);
    return defaultVoice || voices[0] || null;
  }
}

// Singleton instance
let narrator: VoiceNarrator | null = null;

export function getVoiceNarrator(config?: Partial<VoiceConfig>): VoiceNarrator {
  if (!narrator) {
    narrator = new VoiceNarrator(config);
  }
  if (config) narrator.setConfig(config);
  return narrator;
}

export function destroyVoiceNarrator(): void {
  narrator?.stop();
  narrator = null;
}
