"use client";

import { motion } from "framer-motion";

interface StepConnectorProps {
  x: number;
  y1: number;
  y2: number;
  opacity: number;
}

const ARROW_SIZE = 6;

export default function StepConnector({ x, y1, y2, opacity }: StepConnectorProps) {
  const lineEnd = y2 - ARROW_SIZE;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Vertical line */}
      <motion.line
        x1={x}
        y1={y1}
        x2={x}
        y2={lineEnd}
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      {/* Arrowhead */}
      <motion.polygon
        points={`${x},${y2} ${x - ARROW_SIZE},${lineEnd} ${x + ARROW_SIZE},${lineEnd}`}
        fill="rgba(255, 255, 255, 0.25)"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      />
    </motion.g>
  );
}
