# Math Animation Engine — Design Document

## Overview
This document defines the architecture for the animated step-by-step math solver
in the SchoolFlow / Link Scholaire platform. The system spans kindergarten through
PhD-level mathematics. Wolfram Alpha is the source of truth for solving; the front
end animates those exact steps token-by-token using KaTeX + Framer Motion.

## Stack
- React 18 + TypeScript 5
- Next.js 14 (App Router)
- Tailwind CSS
- KaTeX for typesetting
- Framer Motion for animation (layoutId, LayoutGroup, AnimatePresence)
- Wolfram Alpha APIs (AgentOne + CAG/LLM) for solving
- GPT-4o for step-by-step generation (when Wolfram SBS unavailable)

## Level Tiers
The system supports seven levels that drive all defaults:
- K-2: speed 0.4x, playful vocabulary, voice ON, vivid colors
- 3-5: speed 0.55x, elementary vocabulary, voice ON, vivid colors
- 6-8: speed 0.7x, elementary vocabulary, voice ON, standard colors
- 9-10: speed 0.85x, standard vocabulary, voice OFF, standard colors
- 11-12: speed 1.0x, standard vocabulary, voice OFF, standard colors
- undergrad: speed 1.25x, formal vocabulary, voice OFF, subtle colors
- grad: speed 1.5x, rigorous vocabulary, voice OFF, subtle colors

## Math Domains
arithmetic, pre-algebra, algebra, geometry, trigonometry, precalculus,
calculus, multivariable-calc, linear-algebra, differential-eq,
real-analysis, complex-analysis, statistics

## Token Identity Strategy
For layoutId animation to work, tokens must maintain stable IDs across steps.
Strategy: parse LaTeX → AST, generate IDs from path + content hash.
Same conceptual token keeps same ID even when position/side/sign changes.

## Animation Instructions
- highlightTerm: pulse a token with color
- moveTermAcrossEquals: fly token across = sign with sign flip
- changeSign: animate +/- change
- simplifyExpression: collapse tokens into result
- divideBothSides / multiplyBothSides: animate operation
- cancelTerms: fade out cancelled terms
- collapseExpression: merge tokens
- replaceExpression: cross-fade between states
- applyRule: show rule application
- explain: update text panel
- narrate: voice cue
- wait: pause

## Timing (base ms at 1x speed)
- highlightTerm: 900ms
- moveTermAcrossEquals: 1400ms
- changeSign: 500ms
- simplifyExpression: 1200ms
- divideBothSides: 1500ms
- cancelTerms: 900ms
- applyRule: 1400ms
- pauseBetweenSteps: 1000ms

## Current Implementation Status
- SVGVisualizationEngine: canvas-based, basic token animation
- Wolfram AgentOne: integrated as primary solver
- GPT-4o: generates step-by-step from verified Wolfram answers
- KaTeX: renders math in chat bubbles
- Framer Motion: installed but not yet used for token animation

## Next Steps (v2 Animation Engine)
1. Build EquationTokenizer (LaTeX → MathToken[] with stable IDs)
2. Build EquationDiffEngine (diff two states → AnimationInstruction[])
3. Build AnimationOrchestrator (FSM: IDLE → LOADING → PLAYING)
4. Build MathToken component (motion.span with layoutId)
5. Build TokenizedEquation component (renders EquationState)
6. Wire into existing labs page as replacement for SVGVisualizationEngine
7. Add voice narration (browser SpeechSynthesis first, ElevenLabs later)
8. Add level-aware vocabulary
9. Add i18n (en, fr, ar)
