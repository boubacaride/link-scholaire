"use client";

import { motion } from "framer-motion";

interface AnimatedTokenProps {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  opacity?: number;
  animateFrom?: { x: number; y: number };
  progress?: number;
  animationType?: string;
  isGlowing?: boolean;
  delay?: number;
}

/**
 * Compute the current position along a parabolic arc path.
 * The arc peaks at the midpoint (progress=0.5) with a height
 * proportional to the horizontal distance traveled.
 */
function computeArcPosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number
): { x: number; y: number } {
  const linearX = fromX + (toX - fromX) * progress;
  const linearY = fromY + (toY - fromY) * progress;
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  const arcHeight = Math.min(distance * 0.35, 80);
  const arcOffset = Math.sin(progress * Math.PI) * arcHeight;
  return { x: linearX, y: linearY - arcOffset };
}

/**
 * Compute position for a slide-down animation (vertical drop with slight horizontal drift).
 */
function computeSlideDownPosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number
): { x: number; y: number } {
  const eased = 1 - (1 - progress) ** 2; // ease-out quad
  return {
    x: fromX + (toX - fromX) * eased,
    y: fromY + (toY - fromY) * eased,
  };
}

/**
 * Compute position for a bounce animation (overshoot then settle).
 */
function computeBouncePosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number
): { x: number; y: number } {
  // Spring-like overshoot
  const overshoot = 1 + Math.sin(progress * Math.PI * 2) * 0.15 * (1 - progress);
  return {
    x: fromX + (toX - fromX) * overshoot,
    y: fromY + (toY - fromY) * overshoot,
  };
}

/**
 * Compute position for a split animation (fan outward from center).
 */
function computeSplitPosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number
): { x: number; y: number } {
  const eased = 1 - (1 - progress) ** 3; // ease-out cubic
  const fanOffsetY = Math.sin(progress * Math.PI) * 20;
  return {
    x: fromX + (toX - fromX) * eased,
    y: fromY + (toY - fromY) * eased - fanOffsetY,
  };
}

/**
 * Compute the animated position and opacity for any animation type.
 */
function computeAnimatedState(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number,
  animationType: string
): { x: number; y: number; opacity: number } {
  let pos: { x: number; y: number };
  let opacity = 1;

  switch (animationType) {
    case "arc":
      pos = computeArcPosition(fromX, fromY, toX, toY, progress);
      break;
    case "slide_down":
      pos = computeSlideDownPosition(fromX, fromY, toX, toY, progress);
      break;
    case "bounce":
      pos = computeBouncePosition(fromX, fromY, toX, toY, progress);
      break;
    case "fade":
      pos = { x: toX, y: toY };
      opacity = progress;
      break;
    case "merge": {
      const eased = 1 - (1 - progress) ** 2;
      pos = {
        x: fromX + (toX - fromX) * eased,
        y: fromY + (toY - fromY) * eased,
      };
      // Fade slightly during merge then solidify
      opacity = 0.5 + 0.5 * progress;
      break;
    }
    case "split":
      pos = computeSplitPosition(fromX, fromY, toX, toY, progress);
      break;
    case "fraction":
      pos = computeSlideDownPosition(fromX, fromY, toX, toY, progress);
      break;
    default:
      // Smooth linear interpolation for unknown types
      pos = {
        x: fromX + (toX - fromX) * progress,
        y: fromY + (toY - fromY) * progress,
      };
  }

  return { ...pos, opacity };
}

export default function AnimatedToken({
  text,
  x,
  y,
  fontSize,
  color,
  opacity = 1,
  animateFrom,
  progress = 1,
  animationType = "arc",
  isGlowing = false,
  delay = 0,
}: AnimatedTokenProps) {
  // Determine the rendered position
  let renderX = x;
  let renderY = y;
  let renderOpacity = opacity;

  if (animateFrom && progress < 1) {
    const state = computeAnimatedState(
      animateFrom.x,
      animateFrom.y,
      x,
      y,
      progress,
      animationType
    );
    renderX = state.x;
    renderY = state.y;
    renderOpacity = opacity * state.opacity;
  }

  return (
    <motion.g
      initial={
        animateFrom
          ? { x: animateFrom.x, y: animateFrom.y, opacity: 0 }
          : { x: renderX, y: renderY, opacity: 0 }
      }
      animate={{
        x: renderX,
        y: renderY,
        opacity: renderOpacity,
      }}
      transition={
        animationType === "bounce"
          ? {
              type: "spring",
              stiffness: 300,
              damping: 15,
              delay,
            }
          : {
              duration: 0.5,
              ease: "easeInOut",
              delay,
            }
      }
    >
      <motion.text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fill={color}
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        fontWeight={isGlowing ? 700 : 500}
        filter={isGlowing ? "url(#glow)" : undefined}
        style={{ userSelect: "none" }}
      >
        {text}
      </motion.text>

      {/* Subtle underline highlight for glowing tokens */}
      {isGlowing && (
        <motion.line
          x1={-(fontSize * text.length * 0.3)}
          y1={fontSize * 0.55}
          x2={fontSize * text.length * 0.3}
          y2={fontSize * 0.55}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: delay + 0.3 }}
        />
      )}
    </motion.g>
  );
}
