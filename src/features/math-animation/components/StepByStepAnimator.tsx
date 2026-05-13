"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { AnimationStep } from "../engine/types";
import { buildAnimationSteps, parseStepByStepText } from "../engine/diffEngine";
import { detectLevel, getProfile, type Level } from "../engine/levelDetector";
import { phraseFor, detectOperation } from "../engine/vocabulary";
import { getVoiceNarrator, destroyVoiceNarrator } from "../engine/voiceNarrator";
import { t, setLocale, getLocale, isRTL, getVoiceLang, type Locale } from "../engine/i18n";

interface StepByStepAnimatorProps {
  stepByStepText: string;
  originalEquation: string;
  speed?: number;
  autoPlay?: boolean;
  onComplete?: () => void;
  className?: string;
}

/** Render LaTeX to HTML safely — with light text for dark backgrounds */
function renderKatex(latex: string): string {
  try {
    let cleaned = latex
      .replace(/\\\[|\\\]/g, "")
      .replace(/^\$+|\$+$/g, "")
      .replace(/\\\(|\\\)/g, "")
      .trim();
    if (!cleaned) return "";
    const html = katex.renderToString(cleaned, {
      throwOnError: false, displayMode: true, trust: true, strict: false,
    });
    // Wrap with light color override for dark theme
    return `<span style="color:#e2e8f0">${html}</span>`;
  } catch {
    return `<span style="color:#ef4444">${latex}</span>`;
  }
}

/** Global style to ensure all KaTeX elements are visible on dark backgrounds */
const KATEX_DARK_STYLES = `
.katex-display-wrapper .katex,
.katex-display-wrapper .katex .katex-html,
.katex-display-wrapper .katex .katex-mathml,
.katex-display-wrapper .katex .mord,
.katex-display-wrapper .katex .mbin,
.katex-display-wrapper .katex .mrel,
.katex-display-wrapper .katex .mopen,
.katex-display-wrapper .katex .mclose,
.katex-display-wrapper .katex .mpunct,
.katex-display-wrapper .katex .mop,
.katex-display-wrapper .katex .minner,
.katex-display-wrapper .katex .mfrac,
.katex-display-wrapper .katex .msupsub,
.katex-display-wrapper .katex .base {
  color: #e2e8f0 !important;
}
`;

/**
 * Find the specific parts that changed between two equations.
 * Returns arrays of tokens that are "new" in the after equation.
 * Used to highlight only the changed parts in green.
 */
function findChangedParts(before: string, after: string): { changedInAfter: string[] } {
  const norm = (s: string) => s.replace(/−/g, "-").replace(/\s+/g, "").trim();
  if (norm(before) === norm(after)) return { changedInAfter: [] };

  // Split each equation into LHS and RHS
  const splitEq = (s: string) => {
    const idx = s.indexOf("=");
    if (idx === -1) return [s];
    return [s.slice(0, idx).trim(), s.slice(idx + 1).trim()];
  };

  const beforeParts = splitEq(norm(before));
  const afterParts = splitEq(norm(after));

  const changed: string[] = [];
  for (let i = 0; i < afterParts.length; i++) {
    if (i >= beforeParts.length || afterParts[i] !== beforeParts[i]) {
      changed.push(afterParts[i] || "");
    }
  }

  return { changedInAfter: changed };
}

/** Step animation phase */
type StepPhase = "showing-before" | "transitioning" | "showing-after" | "done";

export default function StepByStepAnimator({
  stepByStepText,
  originalEquation,
  speed: speedProp,
  autoPlay = true,
  onComplete,
  className = "",
}: StepByStepAnimatorProps) {
  const [level, setLevel] = useState<Level>("9-10");
  const [steps, setSteps] = useState<AnimationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [locale, setLocaleState] = useState<Locale>("en");
  const [stepPhase, setStepPhase] = useState<StepPhase>("done");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const profile = getProfile(level);
  const speed = speedProp || profile.speed;

  // Auto-detect level
  useEffect(() => {
    if (originalEquation) {
      const detected = detectLevel(originalEquation);
      setLevel(detected);
      const prof = getProfile(detected);
      setVoiceEnabled(prof.voiceNarration);
    }
  }, [originalEquation]);

  // Parse steps
  useEffect(() => {
    if (!stepByStepText) return;
    const parsed = parseStepByStepText(stepByStepText, originalEquation);
    const animated = buildAnimationSteps(parsed, speed);
    setSteps(animated);
    setCurrentStep(-1);
    setVisibleSteps([]);
    if (autoPlay) {
      setTimeout(() => {
        setCurrentStep(0);
        setVisibleSteps([0]);
        setIsPlaying(true);
      }, 600);
    }
  }, [stepByStepText, originalEquation, speed, autoPlay]);

  // Voice narration
  useEffect(() => {
    if (!voiceEnabled || currentStep < 0 || currentStep >= steps.length) return;
    const step = steps[currentStep];
    if (!step) return;

    const narrator = getVoiceNarrator({ lang: getVoiceLang() });
    narrator.setLevel(level);
    const opKey = detectOperation(step.description);
    const phrase = phraseFor(opKey, level);
    const voiceText = phrase.voice || phrase.text || step.description;
    if (voiceText) narrator.speak(voiceText);
    return () => { narrator.stop(); };
  }, [currentStep, voiceEnabled, level, steps]);

  // Step animation phases:
  // 1. "showing-before" - show the equation before this step's operation (briefly)
  // 2. "transitioning" - animate the transition (the equation morphs)
  // 3. "showing-after" - show the result with changed parts highlighted
  // 4. "done" - step complete, ready for next
  useEffect(() => {
    if (currentStep < 0 || currentStep >= steps.length) return;

    const step = steps[currentStep]!;
    const hasDifferentEquations = step.beforeState.latex !== step.afterState.latex;

    if (!hasDifferentEquations) {
      // No change — just show and move on
      setStepPhase("showing-after");
      phaseTimerRef.current = setTimeout(() => setStepPhase("done"), Math.round(1500 / speed));
      return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
    }

    // Phase 1: Show the "before" equation
    setStepPhase("showing-before");

    const t1 = setTimeout(() => {
      // Phase 2: Transition (fade out before, fade in after)
      setStepPhase("transitioning");

      const t2 = setTimeout(() => {
        // Phase 3: Show the "after" equation with highlights
        setStepPhase("showing-after");

        const t3 = setTimeout(() => {
          // Phase 4: Done
          setStepPhase("done");
        }, Math.round(2000 / speed));
        phaseTimerRef.current = t3;
      }, Math.round(1500 / speed));
      phaseTimerRef.current = t2;
    }, Math.round(2000 / speed));
    phaseTimerRef.current = t1;

    return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
  }, [currentStep, speed, steps]);

  // Auto-advance
  useEffect(() => {
    if (!isPlaying || currentStep < 0 || currentStep >= steps.length) return;
    if (stepPhase !== "done") return; // wait for step animation to complete

    const pauseBetweenSteps = Math.round(1500 / speed);
    timerRef.current = setTimeout(() => {
      const next = currentStep + 1;
      if (next < steps.length) {
        setCurrentStep(next);
        setVisibleSteps((prev) => [...prev, next]);
      } else {
        setIsPlaying(false);
        onComplete?.();
      }
    }, pauseBetweenSteps);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentStep, isPlaying, steps, speed, onComplete, stepPhase]);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current && currentStep >= 0) {
      const el = containerRef.current.querySelector(`[data-step="${currentStep}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentStep]);

  // Cleanup
  useEffect(() => () => destroyVoiceNarrator(), []);

  const play = () => { setIsPlaying(true); if (currentStep < 0) { setCurrentStep(0); setVisibleSteps([0]); } };
  const pause = () => setIsPlaying(false);
  const next = () => { const n = Math.min(currentStep + 1, steps.length - 1); setCurrentStep(n); setVisibleSteps((p) => p.includes(n) ? p : [...p, n]); };
  const prev = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };
  const replay = () => { setCurrentStep(0); setVisibleSteps([0]); setIsPlaying(true); };
  const showAll = () => { setVisibleSteps(steps.map((_, i) => i)); setCurrentStep(steps.length - 1); setIsPlaying(false); setStepPhase("done"); };

  const toggleVoice = () => {
    const newState = !voiceEnabled;
    setVoiceEnabled(newState);
    if (!newState) getVoiceNarrator().stop();
  };

  const cycleLang = useCallback(() => {
    const locales: Locale[] = ["en", "fr", "ar"];
    const idx = locales.indexOf(locale);
    const nextL = locales[(idx + 1) % locales.length]!;
    setLocaleState(nextL);
    setLocale(nextL);
  }, [locale]);

  if (steps.length === 0) return null;

  const rtl = isRTL();

  return (
    <div className={className} dir={rtl ? "rtl" : "ltr"}>
      {/* KaTeX dark theme styles */}
      <style dangerouslySetInnerHTML={{ __html: KATEX_DARK_STYLES }} />

      {/* Level badge + controls */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-slate-400 font-mono">
            {t("autoDetected")}: {level}
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
            {t("speed")}: {speed.toFixed(2)}×
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={cycleLang}
            className="px-2 py-1 bg-white/10 text-slate-400 rounded-lg text-[10px] hover:bg-white/20 transition font-medium">
            {locale.toUpperCase()}
          </button>
          <button onClick={toggleVoice}
            className={`px-2 py-1 rounded-lg text-[10px] transition font-medium ${
              voiceEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-slate-500"
            }`}>
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button onClick={isPlaying ? pause : play}
          className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition">
          {isPlaying ? `⏸ ${t("pause")}` : `▶ ${t("play")}`}
        </button>
        <button onClick={prev} disabled={currentStep <= 0}
          className="px-2.5 py-1.5 bg-white/10 text-slate-400 rounded-lg text-xs hover:bg-white/20 transition disabled:opacity-30">
          ◀ {t("prev")}
        </button>
        <button onClick={next} disabled={currentStep >= steps.length - 1}
          className="px-2.5 py-1.5 bg-white/10 text-slate-400 rounded-lg text-xs hover:bg-white/20 transition disabled:opacity-30">
          {t("next")} ▶
        </button>
        <button onClick={replay}
          className="px-2.5 py-1.5 bg-white/10 text-slate-400 rounded-lg text-xs hover:bg-white/20 transition">
          ↺ {t("replay")}
        </button>
        <button onClick={showAll}
          className="px-2.5 py-1.5 bg-white/10 text-slate-400 rounded-lg text-xs hover:bg-white/20 transition">
          {t("showAll")}
        </button>
        <span className="text-[10px] text-slate-500 ml-auto">
          {t("stepOf", { n: Math.max(currentStep + 1, 1), total: steps.length })}
        </span>
      </div>

      {/* Steps display */}
      <div ref={containerRef} className="space-y-3">
        <AnimatePresence mode="popLayout">
          {steps.map((step, i) => {
            const isVisible = visibleSteps.includes(i);
            const isCurrent = i === currentStep;
            const isPast = i < currentStep;
            const isLast = i === steps.length - 1;

            if (!isVisible) return null;

            const opKey = detectOperation(step.description);
            const phrase = phraseFor(opKey, level);

            return (
              <motion.div
                key={`step-${i}`}
                data-step={i}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: isCurrent ? 1 : isPast ? 0.7 : 0.5, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={`rounded-xl overflow-hidden border ${
                  isCurrent ? "border-blue-500/40 bg-white/[0.08] shadow-lg shadow-blue-500/5" :
                  isPast ? "border-white/[0.06] bg-white/[0.03]" :
                  "border-white/[0.04] bg-white/[0.02]"
                }`}
              >
                {/* Step header */}
                <div className={`px-3 py-2 border-b flex items-center gap-2 ${
                  isCurrent ? "border-blue-500/20 bg-blue-500/10" : "border-white/[0.04] bg-white/[0.02]"
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    isPast ? "bg-emerald-500/30 text-emerald-400" :
                    isCurrent ? "bg-blue-500/30 text-blue-400" :
                    "bg-slate-700 text-slate-500"
                  }`}>
                    {isPast ? "✓" : i + 1}
                  </div>
                  <span className={`text-[11px] font-semibold ${isCurrent ? "text-blue-300" : "text-slate-500"}`}>
                    {t("step")} {i + 1}
                  </span>
                </div>

                {/* Step content */}
                <div className="px-4 py-3">
                  {/* Description of what's happening */}
                  <p className={`text-[12px] mb-3 leading-relaxed ${
                    isCurrent ? "text-slate-200" : "text-slate-400"
                  }`}>
                    {phrase.text || step.description}
                  </p>

                  {/* Equation display — the heart of the animation */}
                  <StepEquationDisplay
                    step={step}
                    isCurrent={isCurrent}
                    isPast={isPast}
                    phase={isCurrent ? stepPhase : "done"}
                    speed={speed}
                    colorIntensity={profile.colorIntensity}
                  />

                  {/* Final answer celebration */}
                  {isLast && (isPast || (isCurrent && stepPhase === "done")) && (
                    <motion.div
                      className="mt-3 text-center"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 250 }}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                        ✓ {t("solution")}
                      </span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Individual step equation display.
 * Shows the transition from before → after following Wolfram's pattern:
 * 1. Show "before" equation (what we start with)
 * 2. Animate transition (before fades, arrow appears, after slides in)
 * 3. Show "after" equation with changed parts highlighted in green
 */
function StepEquationDisplay({
  step,
  isCurrent,
  isPast,
  phase,
  speed,
  colorIntensity,
}: {
  step: AnimationStep;
  isCurrent: boolean;
  isPast: boolean;
  phase: StepPhase;
  speed: number;
  colorIntensity: "vivid" | "standard" | "subtle";
}) {
  const beforeLatex = step.beforeState.latex;
  const afterLatex = step.afterState.latex;
  const hasDiff = beforeLatex !== afterLatex;

  // If past or no diff, just show the after equation
  if (isPast || !hasDiff) {
    return (
      <div className="rounded-lg px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
        <div
          className="text-center katex-display-wrapper"
          dangerouslySetInnerHTML={{ __html: renderKatex(afterLatex) }}
        />
      </div>
    );
  }

  // Current step with animation phases
  return (
    <div className="space-y-2">
      {/* BEFORE equation — shows what we start with */}
      <AnimatePresence mode="wait">
        {(phase === "showing-before" || phase === "transitioning") && (
          <motion.div
            key="before"
            className="rounded-lg px-4 py-3 border"
            style={{
              background: phase === "showing-before"
                ? "rgba(239, 68, 68, 0.08)"
                : "rgba(239, 68, 68, 0.04)",
              borderColor: phase === "showing-before"
                ? "rgba(239, 68, 68, 0.3)"
                : "rgba(239, 68, 68, 0.15)",
            }}
            initial={{ opacity: 0, y: -5 }}
            animate={{
              opacity: phase === "transitioning" ? 0.4 : 1,
              y: 0,
              scale: phase === "transitioning" ? 0.97 : 1,
            }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.5 }}
          >
            {phase === "showing-before" && (
              <motion.div
                className="text-[9px] text-red-400/70 mb-1 font-medium uppercase tracking-wider"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Before
              </motion.div>
            )}
            <div
              className="text-center katex-display-wrapper"
              dangerouslySetInnerHTML={{ __html: renderKatex(beforeLatex) }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transition arrow */}
      {phase === "transitioning" && (
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-blue-400/60 text-lg">↓</span>
        </motion.div>
      )}

      {/* AFTER equation — the result of this step's operation */}
      <AnimatePresence mode="wait">
        {(phase === "transitioning" || phase === "showing-after" || phase === "done") && (
          <motion.div
            key="after"
            className="rounded-lg px-4 py-3 border"
            style={{
              background: phase === "showing-after"
                ? "rgba(16, 185, 129, 0.1)"
                : phase === "done"
                ? "rgba(16, 185, 129, 0.05)"
                : "rgba(59, 130, 246, 0.06)",
              borderColor: phase === "showing-after"
                ? "rgba(16, 185, 129, 0.4)"
                : phase === "done"
                ? "rgba(16, 185, 129, 0.2)"
                : "rgba(59, 130, 246, 0.2)",
            }}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            transition={{ duration: 0.5 }}
          >
            {phase === "showing-after" && (
              <motion.div
                className="text-[9px] text-emerald-400/70 mb-1 font-medium uppercase tracking-wider"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Result
              </motion.div>
            )}
            <motion.div
              className="text-center katex-display-wrapper"
              dangerouslySetInnerHTML={{ __html: renderKatex(afterLatex) }}
              animate={phase === "showing-after" ? {
                textShadow: [
                  "0 0 0px rgba(16, 185, 129, 0)",
                  "0 0 12px rgba(16, 185, 129, 0.3)",
                  "0 0 4px rgba(16, 185, 129, 0.1)",
                ],
              } : {}}
              transition={{ duration: 1.5 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
