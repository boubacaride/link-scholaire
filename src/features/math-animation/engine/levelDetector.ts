// Auto-detect math level from equation content
// Analyzes the complexity of the math to determine K-2 through grad level

export type Level = "K-2" | "3-5" | "6-8" | "9-10" | "11-12" | "undergrad" | "grad";

export interface LevelProfile {
  speed: number;
  vocabulary: "playful" | "elementary" | "standard" | "formal" | "rigorous";
  voiceNarration: boolean;
  colorIntensity: "vivid" | "standard" | "subtle";
}

export const LEVEL_PROFILES: Record<Level, LevelProfile> = {
  "K-2":       { speed: 0.3,  vocabulary: "playful",    voiceNarration: true,  colorIntensity: "vivid" },
  "3-5":       { speed: 0.4,  vocabulary: "elementary",  voiceNarration: true,  colorIntensity: "vivid" },
  "6-8":       { speed: 0.5,  vocabulary: "elementary",  voiceNarration: true,  colorIntensity: "standard" },
  "9-10":      { speed: 0.6,  vocabulary: "standard",    voiceNarration: false, colorIntensity: "standard" },
  "11-12":     { speed: 0.7,  vocabulary: "standard",    voiceNarration: false, colorIntensity: "standard" },
  "undergrad": { speed: 0.85, vocabulary: "formal",      voiceNarration: false, colorIntensity: "subtle" },
  "grad":      { speed: 1.0,  vocabulary: "rigorous",    voiceNarration: false, colorIntensity: "subtle" },
};

// Patterns that indicate specific levels (ordered from highest to lowest)
const GRAD_PATTERNS = [
  /\\partial/i, /contour/i, /residue/i, /Cauchy/i, /Lebesgue/i,
  /measure\s+theory/i, /epsilon[- ]delta/i, /\\epsilon/i,
  /Hilbert/i, /Banach/i, /topology/i, /manifold/i,
  /Fourier\s+transform/i, /Laplace\s+transform/i,
  /PDE/i, /partial\s+differential/i,
];

const UNDERGRAD_PATTERNS = [
  /eigenvalue/i, /eigenvector/i, /determinant/i, /\\det/i,
  /matrix|matrices/i, /\\begin\{[pbvBV]?matrix\}/i,
  /vector\s+space/i, /linear\s+transformation/i,
  /\\nabla/i, /divergence/i, /curl/i, /gradient/i,
  /double\s+integral/i, /triple\s+integral/i, /\\iint|\\iiint/i,
  /differential\s+equation/i, /ODE|ode/,
  /separable/i, /Bernoulli/i, /Wronskian/i,
  /\\frac\{d\^2/i, /y''\s*\(/i, /y'''/i,
  /Jacobian/i, /Hessian/i,
];

const CALC_PATTERNS = [
  /\\int/i, /integral/i, /∫/,
  /\\frac\{d\}\{d[a-z]\}/i, /derivative/i, /differentiat/i,
  /\\lim/i, /limit/i,
  /L'Hôpital|L'Hopital|lhopital/i,
  /Taylor\s+series/i, /Maclaurin/i,
  /convergence/i, /divergence/i,
  /u-substitution/i, /integration\s+by\s+parts/i,
  /\\sum_{/i, /series/i,
];

const PRECALC_PATTERNS = [
  /\\log|\\ln|logarithm/i,
  /\\sin|\\cos|\\tan|\\cot|\\sec|\\csc/i,
  /sin\(|cos\(|tan\(/i,
  /trigonometr/i, /identity/i,
  /conic/i, /ellipse/i, /hyperbola/i, /parabola/i,
  /asymptote/i, /domain\s+and\s+range/i,
  /sequence|series/i, /arithmetic\s+sequence|geometric\s+sequence/i,
  /polar/i, /parametric/i,
  /radian/i,
];

const ALGEBRA_PATTERNS = [
  /[a-z]\^2/i, /quadratic/i, /\\sqrt/i, /√/,
  /polynomial/i, /factor/i,
  /system\s+of\s+equations/i,
  /rational\s+expression/i,
  /exponent/i, /radical/i,
  /inequality/i,
  /slope|intercept/i,
  /function/i,
  /[a-z]\s*=\s*[^=]/i,  // equation with variable
];

const PREALGEBRA_PATTERNS = [
  /ratio/i, /percent|%/i, /proportion/i,
  /negative\s+number/i, /integer/i,
  /absolute\s+value/i,
  /order\s+of\s+operations/i,
  /exponent/i,
  /\-\d+/,  // negative numbers
];

const ARITHMETIC_PATTERNS = [
  /^\d+\s*[+\-×÷*/]\s*\d+$/,  // simple arithmetic
  /fraction/i,
  /decimal/i,
  /\\frac\{\d+\}\{\d+\}/,  // simple fraction
  /place\s+value/i,
];

/**
 * Auto-detect the math level from an equation or expression.
 * Analyzes complexity, operators, and mathematical constructs.
 */
export function detectLevel(input: string): Level {
  const text = input.trim();

  // Check from highest to lowest level
  for (const p of GRAD_PATTERNS) {
    if (p.test(text)) return "grad";
  }
  for (const p of UNDERGRAD_PATTERNS) {
    if (p.test(text)) return "undergrad";
  }
  for (const p of CALC_PATTERNS) {
    if (p.test(text)) return "11-12";
  }
  for (const p of PRECALC_PATTERNS) {
    if (p.test(text)) return "11-12";
  }
  for (const p of ALGEBRA_PATTERNS) {
    if (p.test(text)) return "9-10";
  }
  for (const p of PREALGEBRA_PATTERNS) {
    if (p.test(text)) return "6-8";
  }
  for (const p of ARITHMETIC_PATTERNS) {
    if (p.test(text)) return "3-5";
  }

  // Check by content complexity
  const hasVariable = /[a-z]/i.test(text) && !/^(sin|cos|tan|log|ln|lim|det)$/i.test(text);
  const hasEquals = text.includes("=");
  const hasExponent = text.includes("^") || text.includes("²") || text.includes("³");
  const hasFunction = /[a-z]+\(/i.test(text);
  const charCount = text.length;

  if (!hasVariable && !hasFunction) {
    return charCount > 20 ? "3-5" : "K-2";
  }
  if (hasVariable && !hasExponent && hasEquals) {
    return "9-10";  // simple equation
  }
  if (hasExponent) {
    return "9-10";
  }
  if (hasFunction) {
    return "11-12";
  }

  return "6-8";  // default middle ground
}

/**
 * Get the level profile for a detected or specified level.
 */
export function getProfile(level: Level): LevelProfile {
  return LEVEL_PROFILES[level];
}
