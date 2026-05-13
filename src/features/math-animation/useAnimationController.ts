"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import type { SolutionStep } from "./types";

interface AnimationControllerResult {
  progress: number;
  completedSteps: number[];
}

export function useAnimationController(
  steps: SolutionStep[],
  isPlaying: boolean,
  playbackSpeed: number,
  currentStep: number,
  onStepChange: (step: number) => void
): AnimationControllerResult {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const progressRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  // Force re-renders when progress changes
  const [, forceUpdate] = useState(0);

  // Reset everything when steps change
  useEffect(() => {
    setCompletedSteps([]);
    progressRef.current = 0;
    elapsedRef.current = 0;
    lastTimeRef.current = null;
  }, [steps]);

  // Reset elapsed time when currentStep changes
  useEffect(() => {
    elapsedRef.current = 0;
    lastTimeRef.current = null;
    progressRef.current = 0;
  }, [currentStep]);

  // Stable callback refs to avoid stale closures
  const onStepChangeRef = useRef(onStepChange);
  useEffect(() => {
    onStepChangeRef.current = onStepChange;
  }, [onStepChange]);

  const currentStepRef = useRef(currentStep);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = (now - lastTimeRef.current) * playbackSpeedRef.current;
      lastTimeRef.current = now;

      const step = currentStepRef.current;
      const allSteps = stepsRef.current;

      if (step >= allSteps.length) {
        return;
      }

      elapsedRef.current += dt;
      const duration = allSteps[step].duration;
      const newProgress = Math.min(elapsedRef.current / duration, 1);
      progressRef.current = newProgress;

      if (elapsedRef.current >= duration) {
        // Mark step as completed
        setCompletedSteps((prev) =>
          prev.includes(step) ? prev : [...prev, step]
        );

        // Advance to next step
        if (step + 1 < allSteps.length) {
          onStepChangeRef.current(step + 1);
        }
        // elapsedRef resets via the currentStep effect
      }

      forceUpdate((n) => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  return {
    progress: progressRef.current,
    completedSteps,
  };
}
