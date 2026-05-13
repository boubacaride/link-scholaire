// Universal Equation Solver with Animated Term Movement
// Handles: linear, quadratic, polynomial, rational, exponential, logarithmic

export interface TermMovement {
  termId: string;
  term: string;
  fromSide: "left" | "right";
  fromIndex: number;
  toSide: "left" | "right";
  toIndex: number;
  transformation: "negate" | "reciprocal" | "none" | "simplify";
  resultingTerm: string;
  animationType: "arc" | "slide_down" | "bounce" | "fade" | "split" | "merge" | "fraction";
  color: string;
  duration: number;
}

export interface SolutionStep {
  stepNumber: number;
  description: string;
  operation: string;
  beforeEquation: string;
  afterEquation: string;
  termMovements: TermMovement[];
  duration: number;
  highlight?: string;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface SolutionData {
  originalEquation: string;
  equationType: string;
  variable: string;
  steps: SolutionStep[];
  solution: Record<string, number | string | number[]>;
  canGraph: boolean;
  graphData?: {
    type: string;
    points: GraphPoint[];
    features: Record<string, any>;
  };
}

// ─── LINEAR: ax + b = c ────────────────────────────────────────
function solveLinear(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const sides = cleaned.split("=");
  if (sides.length !== 2) return null;

  // Reject multi-variable equations
  const uniqueVars = new Set(cleaned.match(/[a-z]/g) || []);
  if (uniqueVars.size > 1) return null;

  const varMatch = cleaned.match(/[a-z]/);
  if (!varMatch) return null;
  const v = varMatch[0];

  // Pattern: ax + b = c or ax - b = c or cx + d = ex + f
  const lhs = sides[0];
  const rhs = sides[1];

  // Simple pattern: coefficient*var + constant = number
  const simpleMatch = lhs.match(new RegExp(`^(-?\\d*\\.?\\d*)${v}([+-]\\d+\\.?\\d*)?$`));
  const rhsNum = parseFloat(rhs);

  if (simpleMatch && !isNaN(rhsNum)) {
    const coeffStr = simpleMatch[1];
    const coeff = coeffStr === "" || coeffStr === "+" ? 1 : coeffStr === "-" ? -1 : parseFloat(coeffStr);
    const constant = simpleMatch[2] ? parseFloat(simpleMatch[2]) : 0;

    const steps: SolutionStep[] = [];

    // Step 0: Display
    steps.push({
      stepNumber: 0,
      description: "Original equation",
      operation: "display",
      beforeEquation: eq,
      afterEquation: eq,
      termMovements: [],
      duration: 1200,
    });

    let curRHS = rhsNum;
    let curCoeff = coeff;
    const coeffStr2 = fmtCoeff(coeff, v);

    // ── Step 1a: Move constant ACROSS the equals sign ──
    if (constant !== 0) {
      const op = constant > 0 ? "Subtract" : "Add";
      const absC = Math.abs(constant);
      const movedTerm = constant > 0 ? `−${absC}` : `+${absC}`;
      const origTerm = constant > 0 ? `+${absC}` : `−${absC}`;
      const beforeEq = `${coeffStr2}${v} ${origTerm} = ${curRHS}`;
      const intermediateEq = `${coeffStr2}${v} = ${curRHS} ${movedTerm}`;

      steps.push({
        stepNumber: steps.length,
        description: `${op} ${absC} from both sides`,
        operation: constant > 0 ? "subtract" : "add",
        beforeEquation: beforeEq,
        afterEquation: intermediateEq,
        termMovements: [
          {
            termId: "const_move",
            term: origTerm,
            fromSide: "left",
            fromIndex: 1,
            toSide: "right",
            toIndex: 1,
            transformation: "negate",
            resultingTerm: movedTerm,
            animationType: "arc",
            color: "#ffffff",
            duration: 1500,
          },
        ],
        duration: 2000,
      });

      // ── Step 1b: Simplify the RHS (merge 5 and −2 into 3) ──
      const newRHS = curRHS - constant;
      const afterSimpEq = `${coeffStr2}${v} = ${fmtNum(newRHS)}`;

      steps.push({
        stepNumber: steps.length,
        description: `Simplify ${curRHS} ${movedTerm}`,
        operation: "simplify",
        beforeEquation: intermediateEq,
        afterEquation: afterSimpEq,
        termMovements: [
          {
            termId: "merge_a",
            term: `${curRHS}`,
            fromSide: "right",
            fromIndex: 0,
            toSide: "right",
            toIndex: 0,
            transformation: "simplify",
            resultingTerm: fmtNum(newRHS),
            animationType: "merge",
            color: "#ffffff",
            duration: 1500,
          },
          {
            termId: "merge_b",
            term: movedTerm,
            fromSide: "right",
            fromIndex: 1,
            toSide: "right",
            toIndex: 0,
            transformation: "simplify",
            resultingTerm: fmtNum(newRHS),
            animationType: "merge",
            color: "#ffffff",
            duration: 1500,
          },
        ],
        duration: 2000,
      });
      curRHS = newRHS;
    }

    // ── Step 2a: Divide by coefficient (form a fraction) ──
    if (curCoeff !== 1 && curCoeff !== 0) {
      const result = curRHS / curCoeff;
      const beforeEq = `${curCoeff}${v} = ${curRHS}`;
      const fractionEq = `${v} = ${fmtNum(curRHS)}/${curCoeff}`;

      steps.push({
        stepNumber: steps.length,
        description: `Divide both sides by ${curCoeff}`,
        operation: "divide",
        beforeEquation: beforeEq,
        afterEquation: fractionEq,
        termMovements: [
          {
            termId: "coeff_slide",
            term: `${curCoeff}${v}`,
            fromSide: "left",
            fromIndex: 0,
            toSide: "right",
            toIndex: 0,
            transformation: "simplify",
            resultingTerm: `${fmtNum(curRHS)}/${curCoeff}`,
            animationType: "fraction",
            color: "#ffffff",
            duration: 1500,
          },
        ],
        duration: 2000,
      });

      // ── Step 2b: Simplify the fraction ──
      const finalEq = `${v} = ${fmtNum(result)}`;
      steps.push({
        stepNumber: steps.length,
        description: `Simplify ${fmtNum(curRHS)}/${curCoeff}`,
        operation: "simplify",
        beforeEquation: fractionEq,
        afterEquation: finalEq,
        termMovements: [
          {
            termId: "frac_simplify",
            term: `${fmtNum(curRHS)}/${curCoeff}`,
            fromSide: "right",
            fromIndex: 0,
            toSide: "right",
            toIndex: 0,
            transformation: "simplify",
            resultingTerm: fmtNum(result),
            animationType: "merge",
            color: "#ffffff",
            duration: 1500,
          },
        ],
        duration: 2000,
      });

      // Final
      steps.push({
        stepNumber: steps.length,
        description: "Solution found!",
        operation: "solution",
        beforeEquation: finalEq,
        afterEquation: finalEq,
        termMovements: [],
        duration: 1500,
      });

      return {
        originalEquation: eq,
        equationType: "linear",
        variable: v,
        steps,
        solution: { [v]: parseFloat(fmtNum(result)) },
        canGraph: true,
        graphData: generateLinearGraph(coeff, constant, v),
      };
    }

    // Already solved
    steps.push({
      stepNumber: steps.length,
      description: "Solution found!",
      operation: "solution",
      beforeEquation: `${v} = ${curRHS}`,
      afterEquation: `${v} = ${curRHS}`,
      termMovements: [],
      duration: 1500,
    });

    return {
      originalEquation: eq,
      equationType: "linear",
      variable: v,
      steps,
      solution: { [v]: curRHS },
      canGraph: true,
      graphData: generateLinearGraph(1, 0, v),
    };
  }

  return null;
}

// ─── QUADRATIC: ax² + bx + c = 0 ──────────────────────────────
function solveQuadratic(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const sides = cleaned.split("=");
  if (sides.length !== 2) return null;

  // Reject multi-variable equations — let multi-variable solver handle those
  const uniqueVars = new Set(cleaned.match(/[a-z]/g) || []);
  if (uniqueVars.size > 1) return null;

  const rhs = parseFloat(sides[1]);
  if (isNaN(rhs) && sides[1] !== "0") return null;

  const varMatch = cleaned.match(/([a-z])\^2|([a-z])²/);
  if (!varMatch) return null;
  const v = varMatch[1] || varMatch[2];

  // Normalize: replace ² with ^2
  let lhs = sides[0].replace("²", "^2");

  // Extract coefficients
  let a = 0, b = 0, c = -(rhs || 0);

  // Match ax^2
  const aMatch = lhs.match(new RegExp(`(-?\\d*\\.?\\d*)${v}\\^2`));
  if (aMatch) {
    const s = aMatch[1];
    a = s === "" || s === "+" ? 1 : s === "-" ? -1 : parseFloat(s);
  }

  // Match bx (not followed by ^2)
  const bMatch = lhs.match(new RegExp(`([+-]?\\d*\\.?\\d*)${v}(?!\\^)`));
  if (bMatch) {
    const s = bMatch[1];
    b = s === "" || s === "+" ? 1 : s === "-" ? -1 : parseFloat(s);
  }

  // Match constant
  const constMatch = lhs.match(/([+-]\d+\.?\d*)(?![a-z^])/);
  if (constMatch) {
    c += parseFloat(constMatch[1]);
  }

  if (a === 0) return null;

  const steps: SolutionStep[] = [];
  const origEq = `${fmtCoeff(a)}${v}²${fmtConst(b, v)}${fmtConst(c)} = 0`;

  // Step 0: Display
  steps.push({
    stepNumber: 0,
    description: "Original quadratic equation",
    operation: "display",
    beforeEquation: eq,
    afterEquation: origEq,
    termMovements: [],
    duration: 1200,
  });

  // Step 1: Identify coefficients
  steps.push({
    stepNumber: 1,
    description: `Identify coefficients: a = ${a}, b = ${b}, c = ${c}`,
    operation: "identify",
    beforeEquation: origEq,
    afterEquation: `a = ${a}, b = ${b}, c = ${c}`,
    termMovements: [
      { termId: "a", term: `${a}`, fromSide: "left", fromIndex: 0, toSide: "right", toIndex: 0, transformation: "none", resultingTerm: `a = ${a}`, animationType: "fade", color: "#ff6b6b", duration: 800 },
      { termId: "b", term: `${b}`, fromSide: "left", fromIndex: 1, toSide: "right", toIndex: 1, transformation: "none", resultingTerm: `b = ${b}`, animationType: "fade", color: "#48dbfb", duration: 800 },
      { termId: "c", term: `${c}`, fromSide: "left", fromIndex: 2, toSide: "right", toIndex: 2, transformation: "none", resultingTerm: `c = ${c}`, animationType: "fade", color: "#feca57", duration: 800 },
    ],
    duration: 2000,
  });

  // Step 2: Discriminant
  const disc = b * b - 4 * a * c;
  steps.push({
    stepNumber: 2,
    description: `Calculate Δ = b² − 4ac = ${b}² − 4(${a})(${c}) = ${disc}`,
    operation: "discriminant",
    beforeEquation: `Δ = b² − 4ac`,
    afterEquation: `Δ = ${disc}`,
    termMovements: [
      { termId: "disc", term: `${b}²−4(${a})(${c})`, fromSide: "left", fromIndex: 0, toSide: "right", toIndex: 0, transformation: "simplify", resultingTerm: `${disc}`, animationType: "bounce", color: "#ff9ff3", duration: 1500 },
    ],
    duration: 2500,
  });

  // Step 3: Apply formula
  if (disc < 0) {
    steps.push({
      stepNumber: 3,
      description: "Δ < 0 → No real solutions",
      operation: "solution",
      beforeEquation: `Δ = ${disc}`,
      afterEquation: "No real solutions",
      termMovements: [],
      duration: 2000,
    });
    return {
      originalEquation: eq, equationType: "quadratic", variable: v,
      steps, solution: { result: "No real solutions" }, canGraph: true,
      graphData: generateQuadraticGraph(a, b, c, v),
    };
  }

  const x1 = (-b + Math.sqrt(disc)) / (2 * a);
  const x2 = (-b - Math.sqrt(disc)) / (2 * a);

  steps.push({
    stepNumber: 3,
    description: `Apply quadratic formula: ${v} = (−b ± √Δ) / 2a`,
    operation: "formula",
    beforeEquation: `${v} = (−(${b}) ± √${disc}) / 2(${a})`,
    afterEquation: `${v} = (${-b} ± ${fmtNum(Math.sqrt(disc))}) / ${2 * a}`,
    termMovements: [
      { termId: "formula", term: "−b ± √Δ / 2a", fromSide: "left", fromIndex: 0, toSide: "right", toIndex: 0, transformation: "simplify", resultingTerm: `(${-b} ± ${fmtNum(Math.sqrt(disc))}) / ${2 * a}`, animationType: "arc", color: "#54a0ff", duration: 1500 },
    ],
    duration: 2500,
  });

  // Step 4: Solutions
  if (Math.abs(x1 - x2) < 0.0001) {
    steps.push({
      stepNumber: 4,
      description: `Solution: ${v} = ${fmtNum(x1)} (double root)`,
      operation: "solution",
      beforeEquation: `${v} = ${fmtNum(x1)}`,
      afterEquation: `${v} = ${fmtNum(x1)}`,
      termMovements: [],
      duration: 1500,
    });
    return {
      originalEquation: eq, equationType: "quadratic", variable: v,
      steps, solution: { [v]: parseFloat(fmtNum(x1)) }, canGraph: true,
      graphData: generateQuadraticGraph(a, b, c, v),
    };
  }

  steps.push({
    stepNumber: 4,
    description: `Two solutions found`,
    operation: "solution",
    beforeEquation: `${v} = (${-b} ± ${fmtNum(Math.sqrt(disc))}) / ${2 * a}`,
    afterEquation: `${v}₁ = ${fmtNum(x1)}, ${v}₂ = ${fmtNum(x2)}`,
    termMovements: [
      { termId: "x1", term: `${v}₁`, fromSide: "left", fromIndex: 0, toSide: "right", toIndex: 0, transformation: "none", resultingTerm: `${fmtNum(x1)}`, animationType: "bounce", color: "#16c79a", duration: 1200 },
      { termId: "x2", term: `${v}₂`, fromSide: "left", fromIndex: 1, toSide: "right", toIndex: 1, transformation: "none", resultingTerm: `${fmtNum(x2)}`, animationType: "bounce", color: "#16c79a", duration: 1200 },
    ],
    duration: 2000,
  });

  return {
    originalEquation: eq, equationType: "quadratic", variable: v, steps,
    solution: { [`${v}1`]: parseFloat(fmtNum(x1)), [`${v}2`]: parseFloat(fmtNum(x2)) },
    canGraph: true,
    graphData: generateQuadraticGraph(a, b, c, v),
  };
}

// ─── EXPONENTIAL: a^x = b ──────────────────────────────────────
function solveExponential(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const sides = cleaned.split("=");
  if (sides.length !== 2) return null;

  // Pattern: a^x = b
  const match = cleaned.match(/^(\d+\.?\d*)\^([a-z])=(\d+\.?\d*)$/);
  if (!match) return null;

  const base = parseFloat(match[1]);
  const v = match[2];
  const result = parseFloat(match[3]);

  if (base <= 0 || base === 1 || result <= 0) return null;

  const answer = Math.log(result) / Math.log(base);
  const steps: SolutionStep[] = [];

  steps.push({
    stepNumber: 0, description: "Original exponential equation", operation: "display",
    beforeEquation: eq, afterEquation: eq, termMovements: [], duration: 1200,
  });

  steps.push({
    stepNumber: 1,
    description: `Take log base ${base} of both sides`,
    operation: "logarithm",
    beforeEquation: `${base}^${v} = ${result}`,
    afterEquation: `${v} = log${base === 10 ? "" : "₍" + base + "₎"}(${result})`,
    termMovements: [
      { termId: "log_apply", term: `log`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "none", resultingTerm: `log₍${base}₎`, animationType: "fade", color: "#a29bfe", duration: 1500 },
    ],
    duration: 2500,
  });

  steps.push({
    stepNumber: 2,
    description: `Calculate: ${v} = ln(${result}) / ln(${base}) = ${fmtNum(answer)}`,
    operation: "simplify",
    beforeEquation: `${v} = ln(${result}) / ln(${base})`,
    afterEquation: `${v} = ${fmtNum(answer)}`,
    termMovements: [
      { termId: "calc", term: `ln(${result})/ln(${base})`, fromSide: "right", fromIndex: 0, toSide: "right", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(answer), animationType: "bounce", color: "#feca57", duration: 1500 },
    ],
    duration: 2000,
  });

  steps.push({
    stepNumber: 3, description: "Solution found!", operation: "solution",
    beforeEquation: `${v} = ${fmtNum(answer)}`, afterEquation: `${v} = ${fmtNum(answer)}`,
    termMovements: [], duration: 1500,
  });

  return {
    originalEquation: eq, equationType: "exponential", variable: v, steps,
    solution: { [v]: parseFloat(fmtNum(answer)) }, canGraph: true,
    graphData: generateExpGraph(base, v),
  };
}

// ─── LOGARITHMIC: log(x) + b = c ──────────────────────────────
function solveLogarithmic(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const sides = cleaned.split("=");
  if (sides.length !== 2) return null;

  // Pattern: log(x) + b = c or ln(x) + b = c
  const match = cleaned.match(/^(log|ln)\(([a-z])\)([+-]\d+\.?\d*)?=(-?\d+\.?\d*)$/);
  if (!match) return null;

  const logType = match[1];
  const v = match[2];
  const constant = match[3] ? parseFloat(match[3]) : 0;
  const rhs = parseFloat(match[4]);
  const base = logType === "ln" ? Math.E : 10;

  const steps: SolutionStep[] = [];

  steps.push({
    stepNumber: 0, description: `Original logarithmic equation`, operation: "display",
    beforeEquation: eq, afterEquation: eq, termMovements: [], duration: 1200,
  });

  let curRHS = rhs;

  if (constant !== 0) {
    const op = constant > 0 ? "Subtract" : "Add";
    const absC = Math.abs(constant);
    const origTerm = constant > 0 ? `+${absC}` : `−${absC}`;
    const movedTerm = constant > 0 ? `−${absC}` : `+${absC}`;

    // ── Step 1a: Move constant across the equals sign ──
    steps.push({
      stepNumber: steps.length,
      description: `${op} ${absC} from both sides`,
      operation: constant > 0 ? "subtract" : "add",
      beforeEquation: `${logType}(${v}) ${origTerm} = ${rhs}`,
      afterEquation: `${logType}(${v}) = ${rhs} ${movedTerm}`,
      termMovements: [
        {
          termId: "const_move",
          term: origTerm,
          fromSide: "left",
          fromIndex: 1,
          toSide: "right",
          toIndex: 1,
          transformation: "negate",
          resultingTerm: movedTerm,
          animationType: "arc",
          color: "#ffffff",
          duration: 1500,
        },
      ],
      duration: 2000,
    });

    // ── Step 1b: Simplify the RHS ──
    const newRHS = rhs - constant;
    steps.push({
      stepNumber: steps.length,
      description: `Simplify ${rhs} ${movedTerm}`,
      operation: "simplify",
      beforeEquation: `${logType}(${v}) = ${rhs} ${movedTerm}`,
      afterEquation: `${logType}(${v}) = ${fmtNum(newRHS)}`,
      termMovements: [
        {
          termId: "merge_a",
          term: `${rhs}`,
          fromSide: "right",
          fromIndex: 0,
          toSide: "right",
          toIndex: 0,
          transformation: "simplify",
          resultingTerm: fmtNum(newRHS),
          animationType: "merge",
          color: "#ffffff",
          duration: 1500,
        },
        {
          termId: "merge_b",
          term: movedTerm,
          fromSide: "right",
          fromIndex: 1,
          toSide: "right",
          toIndex: 0,
          transformation: "simplify",
          resultingTerm: fmtNum(newRHS),
          animationType: "merge",
          color: "#ffffff",
          duration: 1500,
        },
      ],
      duration: 2000,
    });
    curRHS = newRHS;
  }

  // ── Convert to exponential form ──
  const answer = Math.pow(base, curRHS);
  const expBase = base === Math.E ? "e" : "10";

  steps.push({
    stepNumber: steps.length,
    description: `Convert to exponential form: ${v} = ${expBase}^${curRHS}`,
    operation: "exponentiate",
    beforeEquation: `${logType}(${v}) = ${curRHS}`,
    afterEquation: `${v} = ${expBase}^${curRHS}`,
    termMovements: [
      {
        termId: "exp_convert",
        term: `${logType}(${v})`,
        fromSide: "left",
        fromIndex: 0,
        toSide: "left",
        toIndex: 0,
        transformation: "simplify",
        resultingTerm: v,
        animationType: "bounce",
        color: "#ffffff",
        duration: 1500,
      },
    ],
    duration: 2500,
  });

  // ── Simplify exponential ──
  steps.push({
    stepNumber: steps.length,
    description: `Simplify ${expBase}^${curRHS}`,
    operation: "simplify",
    beforeEquation: `${v} = ${expBase}^${curRHS}`,
    afterEquation: `${v} = ${fmtNum(answer)}`,
    termMovements: [
      {
        termId: "exp_simp",
        term: `${expBase}^${curRHS}`,
        fromSide: "right",
        fromIndex: 0,
        toSide: "right",
        toIndex: 0,
        transformation: "simplify",
        resultingTerm: fmtNum(answer),
        animationType: "merge",
        color: "#ffffff",
        duration: 1500,
      },
    ],
    duration: 2000,
  });

  steps.push({
    stepNumber: steps.length,
    description: "Solution found!",
    operation: "solution",
    beforeEquation: `${v} = ${fmtNum(answer)}`,
    afterEquation: `${v} = ${fmtNum(answer)}`,
    termMovements: [],
    duration: 1500,
  });

  return {
    originalEquation: eq, equationType: "logarithmic", variable: v, steps,
    solution: { [v]: parseFloat(fmtNum(answer)) }, canGraph: false,
  };
}

// ─── RATIONAL: (ax+b)/(cx+d) = e ──────────────────────────────
function solveRational(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();

  // Pattern: (ax+b)/(cx+d) = e
  const match = cleaned.match(
    /^\((-?\d*\.?\d*)([a-z])([+-]\d+\.?\d*)\)\/\((-?\d*\.?\d*)([a-z])([+-]\d+\.?\d*)\)=(-?\d+\.?\d*)$/
  );
  if (!match) return null;

  const a = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : parseFloat(match[1]);
  const v = match[2];
  const b = parseFloat(match[3]);
  const c2 = match[4] === "" || match[4] === "+" ? 1 : match[4] === "-" ? -1 : parseFloat(match[4]);
  const d = parseFloat(match[6]);
  const e = parseFloat(match[7]);

  const steps: SolutionStep[] = [];

  steps.push({
    stepNumber: 0, description: "Original rational equation", operation: "display",
    beforeEquation: eq, afterEquation: eq, termMovements: [], duration: 1200,
  });

  // Cross multiply: (ax+b) = e(cx+d)
  steps.push({
    stepNumber: 1,
    description: `Multiply both sides by (${fmtCoeff(c2)}${v}${fmtConst(d)})`,
    operation: "cross_multiply",
    beforeEquation: `(${fmtCoeff(a)}${v}${fmtConst(b)}) / (${fmtCoeff(c2)}${v}${fmtConst(d)}) = ${e}`,
    afterEquation: `${fmtCoeff(a)}${v}${fmtConst(b)} = ${e}(${fmtCoeff(c2)}${v}${fmtConst(d)})`,
    termMovements: [
      { termId: "denom_move", term: `(${fmtCoeff(c2)}${v}${fmtConst(d)})`, fromSide: "left", fromIndex: 1, toSide: "right", toIndex: 0, transformation: "none", resultingTerm: `×(${fmtCoeff(c2)}${v}${fmtConst(d)})`, animationType: "arc", color: "#ff6b6b", duration: 1500 },
    ],
    duration: 2500,
  });

  // Expand: ax + b = ecx + ed
  const ec = e * c2;
  const ed = e * d;
  steps.push({
    stepNumber: 2,
    description: `Expand right side: ${e} × (${fmtCoeff(c2)}${v}${fmtConst(d)})`,
    operation: "expand",
    beforeEquation: `${fmtCoeff(a)}${v}${fmtConst(b)} = ${e}(${fmtCoeff(c2)}${v}${fmtConst(d)})`,
    afterEquation: `${fmtCoeff(a)}${v}${fmtConst(b)} = ${fmtCoeff(ec)}${v}${fmtConst(ed)}`,
    termMovements: [
      { termId: "expand", term: `${e}(...)`, fromSide: "right", fromIndex: 0, toSide: "right", toIndex: 0, transformation: "simplify", resultingTerm: `${fmtCoeff(ec)}${v}${fmtConst(ed)}`, animationType: "split", color: "#feca57", duration: 1500 },
    ],
    duration: 2000,
  });

  // Collect: (a - ec)x = ed - b
  const coeffX = a - ec;
  const constVal = ed - b;

  steps.push({
    stepNumber: 3,
    description: `Collect ${v} terms: (${a} − ${ec})${v} = ${ed} − ${b}`,
    operation: "collect",
    beforeEquation: `${fmtCoeff(a)}${v}${fmtConst(b)} = ${fmtCoeff(ec)}${v}${fmtConst(ed)}`,
    afterEquation: `${fmtCoeff(coeffX)}${v} = ${constVal}`,
    termMovements: [
      { termId: "collect_x", term: `${fmtCoeff(ec)}${v}`, fromSide: "right", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "negate", resultingTerm: `−${fmtCoeff(ec)}${v}`, animationType: "arc", color: "#48dbfb", duration: 1200 },
      { termId: "collect_c", term: `${fmtConst(b)}`, fromSide: "left", fromIndex: 1, toSide: "right", toIndex: 0, transformation: "negate", resultingTerm: `${b > 0 ? "-" : "+"}${Math.abs(b)}`, animationType: "arc", color: "#ff6b6b", duration: 1200 },
    ],
    duration: 2500,
  });

  if (coeffX === 0) {
    steps.push({
      stepNumber: 4, description: constVal === 0 ? "Infinite solutions" : "No solution",
      operation: "solution", beforeEquation: `0 = ${constVal}`, afterEquation: constVal === 0 ? "All real numbers" : "No solution",
      termMovements: [], duration: 1500,
    });
    return {
      originalEquation: eq, equationType: "rational", variable: v, steps,
      solution: { result: constVal === 0 ? "Infinite solutions" : "No solution" }, canGraph: false,
    };
  }

  const answer = constVal / coeffX;

  steps.push({
    stepNumber: 4,
    description: `Divide both sides by ${coeffX}`,
    operation: "divide",
    beforeEquation: `${fmtCoeff(coeffX)}${v} = ${constVal}`,
    afterEquation: `${v} = ${fmtNum(answer)}`,
    termMovements: [
      { termId: "div_final", term: `${coeffX}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `÷${coeffX}`, animationType: "slide_down", color: "#feca57", duration: 1500 },
    ],
    duration: 2000,
  });

  steps.push({
    stepNumber: 5, description: "Solution found!", operation: "solution",
    beforeEquation: `${v} = ${fmtNum(answer)}`, afterEquation: `${v} = ${fmtNum(answer)}`,
    termMovements: [], duration: 1500,
  });

  return {
    originalEquation: eq, equationType: "rational", variable: v, steps,
    solution: { [v]: parseFloat(fmtNum(answer)) }, canGraph: false,
  };
}

// ─── GRAPH GENERATORS ──────────────────────────────────────────
function generateLinearGraph(m: number, b: number, _v?: string) {
  const points: GraphPoint[] = [];
  for (let x = -10; x <= 10; x += 0.5) {
    points.push({ x, y: m * x + b });
  }
  return { type: "linear", points, features: { slope: m, intercept: b } };
}

function generateQuadraticGraph(a: number, b: number, c: number, _v?: string) {
  const points: GraphPoint[] = [];
  const vertexX = -b / (2 * a);
  for (let x = vertexX - 5; x <= vertexX + 5; x += 0.2) {
    points.push({ x, y: a * x * x + b * x + c });
  }
  return { type: "quadratic", points, features: { vertex: { x: vertexX, y: a * vertexX * vertexX + b * vertexX + c } } };
}

function generateExpGraph(base: number, _v?: string) {
  const points: GraphPoint[] = [];
  for (let x = -3; x <= 5; x += 0.2) {
    points.push({ x, y: Math.pow(base, x) });
  }
  return { type: "exponential", points, features: { base } };
}

// ─── FORMATTING HELPERS ────────────────────────────────────────
function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function fmtCoeff(c: number, v?: string): string {
  if (c === 1) return v ? "" : "1";
  if (c === -1) return "-";
  return c.toString();
}

function fmtConst(c: number, v?: string): string {
  if (c === 0) return "";
  if (v) {
    if (c > 0) return ` + ${c === 1 ? "" : c}${v}`;
    return ` − ${c === -1 ? "" : Math.abs(c)}${v}`;
  }
  if (c > 0) return ` + ${c}`;
  return ` − ${Math.abs(c)}`;
}

// ─── ARITHMETIC: 4+5, 10-3, 6*7, 12/4 ──────────────────────────
// Plain arithmetic expressions with no variable and no equals sign.
// Solves left-to-right for add/subtract, respecting × ÷ precedence.
function solveArithmetic(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");

  // Must be pure arithmetic — no variables, no equals sign
  if (/[a-z]/i.test(cleaned)) return null;
  if (cleaned.includes("=")) return null;
  if (!/^[\d+\-*/.]+$/.test(cleaned)) return null;
  if (!/[+\-*/]/.test(cleaned.slice(1))) return null; // must have at least one operator

  // Tokenize: numbers and operators (handle leading negative)
  const tokens: (number | string)[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      // Leading negative
      if (ch === "-" && (i === 0 || "+-*/".includes(cleaned[i - 1] as string))) {
        let num = "-";
        i++;
        while (i < cleaned.length && /[\d.]/.test(cleaned[i])) {
          num += cleaned[i++];
        }
        tokens.push(parseFloat(num));
      } else {
        tokens.push(ch);
        i++;
      }
    } else {
      let num = "";
      while (i < cleaned.length && /[\d.]/.test(cleaned[i])) {
        num += cleaned[i++];
      }
      if (num) tokens.push(parseFloat(num));
    }
  }

  if (tokens.length < 3) return null;

  const steps: SolutionStep[] = [];

  // Step 0: display
  steps.push({
    stepNumber: 0,
    description: "Original expression",
    operation: "display",
    beforeEquation: eq,
    afterEquation: eq,
    termMovements: [],
    duration: 1200,
  });

  // Reconstruct a readable string from tokens
  const renderTokens = (toks: (number | string)[]): string => {
    return toks
      .map((t, idx) => {
        if (typeof t === "number") {
          if (t < 0 && idx > 0) return `(${fmtNum(t)})`;
          return fmtNum(t);
        }
        return ` ${t} `;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Evaluate *and / first (left to right)
  let working = [...tokens];
  const opNames: Record<string, string> = {
    "+": "add",
    "-": "subtract",
    "*": "multiply",
    "/": "divide",
  };
  const opLabels: Record<string, string> = {
    "+": "Add",
    "-": "Subtract",
    "*": "Multiply",
    "/": "Divide",
  };

  // Precedence 1: * and /
  while (true) {
    const idx = working.findIndex((t) => t === "*" || t === "/");
    if (idx === -1) break;
    const a = working[idx - 1] as number;
    const op = working[idx] as string;
    const b = working[idx + 1] as number;
    const result = op === "*" ? a * b : a / b;

    const beforeEq = renderTokens(working);
    const afterWorking = [...working];
    afterWorking.splice(idx - 1, 3, result);
    const afterEq = renderTokens(afterWorking);

    steps.push({
      stepNumber: steps.length,
      description: `${opLabels[op]} ${fmtNum(a)} ${op === "*" ? "×" : "÷"} ${fmtNum(b)}`,
      operation: opNames[op],
      beforeEquation: beforeEq,
      afterEquation: afterEq,
      termMovements: [
        {
          termId: `merge_a_${idx}`,
          term: fmtNum(a),
          fromSide: "left",
          fromIndex: idx - 1,
          toSide: "left",
          toIndex: idx - 1,
          transformation: "simplify",
          resultingTerm: fmtNum(result),
          animationType: "merge",
          color: "#ffffff",
          duration: 1500,
        },
        {
          termId: `merge_b_${idx}`,
          term: fmtNum(b),
          fromSide: "left",
          fromIndex: idx,
          toSide: "left",
          toIndex: idx - 1,
          transformation: "simplify",
          resultingTerm: fmtNum(result),
          animationType: "merge",
          color: "#ffffff",
          duration: 1500,
        },
      ],
      duration: 2000,
    });
    working = afterWorking;
  }

  // Precedence 2: + and -
  while (working.length > 1) {
    const idx = working.findIndex((t) => t === "+" || t === "-");
    if (idx === -1) break;
    const a = working[idx - 1] as number;
    const op = working[idx] as string;
    const b = working[idx + 1] as number;
    const result = op === "+" ? a + b : a - b;

    const beforeEq = renderTokens(working);
    const afterWorking = [...working];
    afterWorking.splice(idx - 1, 3, result);
    const afterEq = renderTokens(afterWorking);

    steps.push({
      stepNumber: steps.length,
      description: `${opLabels[op]} ${fmtNum(a)} ${op === "+" ? "+" : "−"} ${fmtNum(b)}`,
      operation: opNames[op],
      beforeEquation: beforeEq,
      afterEquation: afterEq,
      termMovements: [
        {
          termId: `merge_a_${idx}`,
          term: fmtNum(a),
          fromSide: "left",
          fromIndex: idx - 1,
          toSide: "left",
          toIndex: idx - 1,
          transformation: "simplify",
          resultingTerm: fmtNum(result),
          animationType: "merge",
          color: "#ffffff",
          duration: 1500,
        },
        {
          termId: `merge_b_${idx}`,
          term: `${op === "+" ? "+" : "−"}${fmtNum(b)}`,
          fromSide: "left",
          fromIndex: idx + 1,
          toSide: "left",
          toIndex: idx - 1,
          transformation: "simplify",
          resultingTerm: fmtNum(result),
          animationType: "merge",
          color: "#ffffff",
          duration: 1500,
        },
      ],
      duration: 2000,
    });
    working = afterWorking;
  }

  const finalAnswer = working[0] as number;

  // Solution
  steps.push({
    stepNumber: steps.length,
    description: "Result",
    operation: "solution",
    beforeEquation: `${fmtNum(finalAnswer)}`,
    afterEquation: `= ${fmtNum(finalAnswer)}`,
    termMovements: [],
    duration: 1500,
  });

  return {
    originalEquation: eq,
    equationType: "arithmetic",
    variable: "",
    steps,
    solution: { result: finalAnswer },
    canGraph: false,
  };
}

// ─── SQUARE ROOT: sqrt(16), √25, √(9+16) ──────────────────────
function solveSqrt(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const match = cleaned.match(/^(?:sqrt|√)\(?(\d+\.?\d*)\)?$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const result = Math.sqrt(num);
  const steps: SolutionStep[] = [
    { stepNumber: 0, description: "Original expression", operation: "display", beforeEquation: `√${num}`, afterEquation: `√${num}`, termMovements: [], duration: 1200 },
    {
      stepNumber: 1,
      description: `Calculate √${num}`,
      operation: "simplify",
      beforeEquation: `√${num}`,
      afterEquation: `${fmtNum(result)}`,
      termMovements: [
        { termId: "sqrt", term: `√${num}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(result), animationType: "merge", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    },
    { stepNumber: 2, description: "Result", operation: "solution", beforeEquation: fmtNum(result), afterEquation: `= ${fmtNum(result)}`, termMovements: [], duration: 1500 },
  ];
  return { originalEquation: eq, equationType: "square root", variable: "", steps, solution: { result: parseFloat(fmtNum(result)) }, canGraph: false };
}

// ─── FACTORIAL: 5!, 10! ────────────────────────────────────────
function solveFactorial(eq: string): SolutionData | null {
  const match = eq.trim().match(/^(\d+)!$/);
  if (!match) return null;

  const n = parseInt(match[1]);
  if (n > 20 || n < 0) return null;

  let result = 1;
  const steps: SolutionStep[] = [
    { stepNumber: 0, description: "Original expression", operation: "display", beforeEquation: `${n}!`, afterEquation: `${n}!`, termMovements: [], duration: 1200 },
  ];

  // Show expansion
  const expansion = Array.from({ length: n }, (_, i) => n - i).join(" × ");
  steps.push({
    stepNumber: 1,
    description: `Expand ${n}!`,
    operation: "expand",
    beforeEquation: `${n}!`,
    afterEquation: expansion || "1",
    termMovements: [
      { termId: "expand", term: `${n}!`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: expansion || "1", animationType: "bounce", color: "#ffffff", duration: 1500 },
    ],
    duration: 2000,
  });

  for (let i = 1; i <= n; i++) result *= i;

  steps.push({
    stepNumber: 2,
    description: `Calculate ${expansion || "1"}`,
    operation: "simplify",
    beforeEquation: expansion || "1",
    afterEquation: `${result}`,
    termMovements: [
      { termId: "calc", term: expansion || "1", fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${result}`, animationType: "merge", color: "#ffffff", duration: 1500 },
    ],
    duration: 2000,
  });

  steps.push({ stepNumber: 3, description: "Result", operation: "solution", beforeEquation: `${result}`, afterEquation: `= ${result}`, termMovements: [], duration: 1500 });
  return { originalEquation: eq, equationType: "factorial", variable: "", steps, solution: { result }, canGraph: false };
}

// ─── POWER: 2^8, 3^4 ──────────────────────────────────────────
function solvePower(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "");
  const match = cleaned.match(/^(-?\d+\.?\d*)\^(\d+\.?\d*)$/);
  if (!match) return null;
  // Don't match if it has variables (handled by exponential solver)
  if (/[a-z]/i.test(cleaned)) return null;

  const base = parseFloat(match[1]);
  const exp = parseFloat(match[2]);
  const result = Math.pow(base, exp);

  const steps: SolutionStep[] = [
    { stepNumber: 0, description: "Original expression", operation: "display", beforeEquation: `${base}^${exp}`, afterEquation: `${base}^${exp}`, termMovements: [], duration: 1200 },
  ];

  if (Number.isInteger(exp) && exp <= 6 && exp >= 2) {
    const expansion = Array.from({ length: exp }, () => fmtNum(base)).join(" × ");
    steps.push({
      stepNumber: 1,
      description: `Expand ${fmtNum(base)}^${fmtNum(exp)}`,
      operation: "expand",
      beforeEquation: `${fmtNum(base)}^${fmtNum(exp)}`,
      afterEquation: expansion,
      termMovements: [
        { termId: "expand", term: `${fmtNum(base)}^${fmtNum(exp)}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: expansion, animationType: "bounce", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    });
    steps.push({
      stepNumber: 2,
      description: `Calculate ${expansion}`,
      operation: "simplify",
      beforeEquation: expansion,
      afterEquation: fmtNum(result),
      termMovements: [
        { termId: "calc", term: expansion, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(result), animationType: "merge", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    });
  } else {
    steps.push({
      stepNumber: 1,
      description: `Calculate ${fmtNum(base)}^${fmtNum(exp)}`,
      operation: "simplify",
      beforeEquation: `${fmtNum(base)}^${fmtNum(exp)}`,
      afterEquation: fmtNum(result),
      termMovements: [
        { termId: "calc", term: `${fmtNum(base)}^${fmtNum(exp)}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(result), animationType: "merge", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    });
  }

  steps.push({ stepNumber: steps.length, description: "Result", operation: "solution", beforeEquation: fmtNum(result), afterEquation: `= ${fmtNum(result)}`, termMovements: [], duration: 1500 });
  return { originalEquation: eq, equationType: "power", variable: "", steps, solution: { result: parseFloat(fmtNum(result)) }, canGraph: false };
}

// ─── PERCENTAGE: 25% of 200, 15% * 80 ─────────────────────────
function solvePercentage(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();

  // Pattern: N% of M or N%*M
  const match = cleaned.match(/^(\d+\.?\d*)%(?:of|\*)?(\d+\.?\d*)$/);
  if (!match) return null;

  const pct = parseFloat(match[1]);
  const base = parseFloat(match[2]);
  const decimal = pct / 100;
  const result = decimal * base;

  const steps: SolutionStep[] = [
    { stepNumber: 0, description: "Original expression", operation: "display", beforeEquation: `${pct}% of ${base}`, afterEquation: `${pct}% of ${base}`, termMovements: [], duration: 1200 },
    {
      stepNumber: 1,
      description: `Convert ${pct}% to decimal`,
      operation: "simplify",
      beforeEquation: `${pct}% of ${base}`,
      afterEquation: `${decimal} × ${base}`,
      termMovements: [
        { termId: "pct", term: `${pct}%`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${decimal}`, animationType: "merge", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    },
    {
      stepNumber: 2,
      description: `Multiply ${decimal} × ${base}`,
      operation: "simplify",
      beforeEquation: `${decimal} × ${base}`,
      afterEquation: fmtNum(result),
      termMovements: [
        { termId: "mul_a", term: `${decimal}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(result), animationType: "merge", color: "#ffffff", duration: 1500 },
        { termId: "mul_b", term: `${base}`, fromSide: "left", fromIndex: 1, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(result), animationType: "merge", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    },
    { stepNumber: 3, description: "Result", operation: "solution", beforeEquation: fmtNum(result), afterEquation: `= ${fmtNum(result)}`, termMovements: [], duration: 1500 },
  ];

  return { originalEquation: eq, equationType: "percentage", variable: "", steps, solution: { result: parseFloat(fmtNum(result)) }, canGraph: false };
}

// ─── TRIG: sin(30), cos(60), tan(45) ──────────────────────────
function solveTrig(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const match = cleaned.match(/^(sin|cos|tan)\((\d+\.?\d*)(°?)\)$/);
  if (!match) return null;

  const fn = match[1];
  const angle = parseFloat(match[2]);
  const isDegrees = match[3] === "°" || angle > 6.3; // assume degrees if > 2π
  const radians = isDegrees ? (angle * Math.PI) / 180 : angle;

  const fnMap: Record<string, (r: number) => number> = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
  };
  const result = fnMap[fn](radians);

  const steps: SolutionStep[] = [
    { stepNumber: 0, description: "Original expression", operation: "display", beforeEquation: eq, afterEquation: eq, termMovements: [], duration: 1200 },
  ];

  if (isDegrees) {
    steps.push({
      stepNumber: 1,
      description: `Convert ${angle}° to radians`,
      operation: "simplify",
      beforeEquation: `${fn}(${angle}°)`,
      afterEquation: `${fn}(${fmtNum(radians)} rad)`,
      termMovements: [
        { termId: "deg", term: `${angle}°`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${fmtNum(radians)} rad`, animationType: "merge", color: "#ffffff", duration: 1500 },
      ],
      duration: 2000,
    });
  }

  steps.push({
    stepNumber: steps.length,
    description: `Calculate ${fn}(${isDegrees ? angle + "°" : fmtNum(radians)})`,
    operation: "simplify",
    beforeEquation: `${fn}(${fmtNum(radians)})`,
    afterEquation: fmtNum(result),
    termMovements: [
      { termId: "trig", term: `${fn}(...)`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: fmtNum(result), animationType: "merge", color: "#ffffff", duration: 1500 },
    ],
    duration: 2000,
  });

  steps.push({ stepNumber: steps.length, description: "Result", operation: "solution", beforeEquation: fmtNum(result), afterEquation: `= ${fmtNum(result)}`, termMovements: [], duration: 1500 });
  return { originalEquation: eq, equationType: "trigonometry", variable: "", steps, solution: { result: parseFloat(fmtNum(result)) }, canGraph: false };
}

// ─── MULTI-VARIABLE: x^2+y^3+9=0  →  solve for y ──────────────
// Parses terms, groups by target variable, isolates it.
function solveMultiVariable(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();
  const sides = cleaned.split("=");
  if (sides.length !== 2) return null;

  // Find all unique variables
  const vars = Array.from(new Set(cleaned.match(/[a-z]/g) || []));
  if (vars.length < 2) return null;

  // Default: solve for the last variable alphabetically (usually y)
  const solveFor = vars.sort().pop()!;

  // Parse the equation: move everything to left side (= 0)
  // We need to extract terms and identify which contain our target variable
  const lhs = sides[0];
  const rhs = sides[1];

  // Tokenize into terms (respecting signs)
  function extractTerms(expr: string, negate: boolean): string[] {
    const terms: string[] = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth === 0 && (ch === "+" || ch === "-") && i > 0) {
        if (current) terms.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) terms.push(current);
    if (negate) {
      return terms.map((t) => {
        if (t.startsWith("+")) return "-" + t.slice(1);
        if (t.startsWith("-")) return "+" + t.slice(1);
        return "-" + t;
      });
    }
    return terms;
  }

  const allTerms = [
    ...extractTerms(lhs, false),
    ...extractTerms(rhs, true), // negate RHS to move to LHS
  ];

  // Classify each term: does it contain the target variable?
  const targetTerms: string[] = []; // terms with solveFor variable
  const otherTerms: string[] = [];  // terms without it

  for (const term of allTerms) {
    if (term.includes(solveFor)) {
      targetTerms.push(term);
    } else {
      otherTerms.push(term);
    }
  }

  if (targetTerms.length === 0) return null;

  // Determine the power of solveFor in the target terms
  let targetPower = 1;
  for (const t of targetTerms) {
    const powMatch = t.match(new RegExp(`${solveFor}\\^(\\d+)`));
    if (powMatch) {
      targetPower = Math.max(targetPower, parseInt(powMatch[1]));
    }
  }

  // Build display strings
  const targetExpr = targetTerms.join("").replace(/^\+/, "");
  const negOtherTerms = otherTerms.map((t) => {
    if (t.startsWith("+")) return "-" + t.slice(1);
    if (t.startsWith("-")) return "+" + t.slice(1);
    return "-" + t;
  });
  const filteredNeg = negOtherTerms.filter((t) => t.replace(/[+-]/g, "").trim() !== "0");
  const rhsExpr = filteredNeg.join("").replace(/^\+/, "").replace(/^\s+/, "") || "0";

  const steps: SolutionStep[] = [];

  // Step 0: Display
  steps.push({
    stepNumber: 0,
    description: `Solve for ${solveFor}`,
    operation: "display",
    beforeEquation: eq,
    afterEquation: eq,
    termMovements: [],
    duration: 1500,
  });

  // Step 1: Move other terms to RHS (skip zero terms)
  const nonZeroOther = otherTerms.filter((t) => t.replace(/[+-]/g, "").trim() !== "0");
  if (nonZeroOther.length > 0) {
    steps.push({
      stepNumber: 1,
      description: `Isolate ${solveFor} terms on the left`,
      operation: "subtract",
      beforeEquation: eq,
      afterEquation: `${targetExpr} = ${rhsExpr}`,
      termMovements: nonZeroOther.map((t, i) => ({
        termId: `move_${i}`,
        term: t.replace(/^\+/, ""),
        fromSide: "left" as const,
        fromIndex: i + 1,
        toSide: "right" as const,
        toIndex: i,
        transformation: "negate" as const,
        resultingTerm: filteredNeg[i]?.replace(/^\+/, "") || "",
        animationType: "arc" as const,
        color: "#ffffff",
        duration: 1500,
      })),
      duration: 2500,
    });
  }

  // Step 2: Handle coefficient on the target variable term
  // Extract coefficient: e.g., "2y^3" → coeff=2
  let coeffMatch = targetTerms[0]?.match(new RegExp(`^([+-]?\\d*\\.?\\d*)${solveFor}`));
  let coeff = 1;
  if (coeffMatch) {
    const c = coeffMatch[1];
    coeff = c === "" || c === "+" ? 1 : c === "-" ? -1 : parseFloat(c);
  }

  let currentLHS = targetExpr;
  let currentRHS = rhsExpr;

  if (coeff !== 1 && coeff !== 0 && targetTerms.length === 1) {
    const divRHS = coeff === -1 ? `-(${currentRHS})` : `(${currentRHS})/${coeff}`;
    steps.push({
      stepNumber: steps.length,
      description: `Divide both sides by ${coeff}`,
      operation: "divide",
      beforeEquation: `${currentLHS} = ${currentRHS}`,
      afterEquation: `${solveFor}${targetPower > 1 ? "^" + targetPower : ""} = ${divRHS}`,
      termMovements: [{
        termId: "div_coeff",
        term: `${coeff}`,
        fromSide: "left",
        fromIndex: 0,
        toSide: "right",
        toIndex: 0,
        transformation: "simplify",
        resultingTerm: `÷${coeff}`,
        animationType: "slide_down",
        color: "#ffffff",
        duration: 1500,
      }],
      duration: 2000,
    });
    currentRHS = divRHS;
  }

  // Step 3: Take root if power > 1
  if (targetPower === 2) {
    steps.push({
      stepNumber: steps.length,
      description: `Take the square root of both sides`,
      operation: "simplify",
      beforeEquation: `${solveFor}^2 = ${currentRHS}`,
      afterEquation: `${solveFor} = ±√(${currentRHS})`,
      termMovements: [{
        termId: "sqrt_apply",
        term: `${solveFor}^2`,
        fromSide: "left",
        fromIndex: 0,
        toSide: "left",
        toIndex: 0,
        transformation: "simplify",
        resultingTerm: solveFor,
        animationType: "bounce",
        color: "#ffffff",
        duration: 1500,
      }],
      duration: 2500,
    });
    currentRHS = `±√(${currentRHS})`;
  } else if (targetPower === 3) {
    steps.push({
      stepNumber: steps.length,
      description: `Take the cube root of both sides`,
      operation: "simplify",
      beforeEquation: `${solveFor}^3 = ${currentRHS}`,
      afterEquation: `${solveFor} = ∛(${currentRHS})`,
      termMovements: [{
        termId: "cbrt_apply",
        term: `${solveFor}^3`,
        fromSide: "left",
        fromIndex: 0,
        toSide: "left",
        toIndex: 0,
        transformation: "simplify",
        resultingTerm: solveFor,
        animationType: "bounce",
        color: "#ffffff",
        duration: 1500,
      }],
      duration: 2500,
    });
    currentRHS = `∛(${currentRHS})`;
  } else if (targetPower > 3) {
    steps.push({
      stepNumber: steps.length,
      description: `Take the ${targetPower}th root of both sides`,
      operation: "simplify",
      beforeEquation: `${solveFor}^${targetPower} = ${currentRHS}`,
      afterEquation: `${solveFor} = (${currentRHS})^(1/${targetPower})`,
      termMovements: [{
        termId: "nrt_apply",
        term: `${solveFor}^${targetPower}`,
        fromSide: "left",
        fromIndex: 0,
        toSide: "left",
        toIndex: 0,
        transformation: "simplify",
        resultingTerm: solveFor,
        animationType: "bounce",
        color: "#ffffff",
        duration: 1500,
      }],
      duration: 2500,
    });
    currentRHS = `(${currentRHS})^(1/${targetPower})`;
  }

  // Solution step
  const solutionText = `${solveFor} = ${currentRHS}`;
  steps.push({
    stepNumber: steps.length,
    description: "Solution",
    operation: "solution",
    beforeEquation: solutionText,
    afterEquation: solutionText,
    termMovements: [],
    duration: 1500,
  });

  return {
    originalEquation: eq,
    equationType: "multi-variable",
    variable: solveFor,
    steps,
    solution: { [solveFor]: currentRHS },
    canGraph: false,
  };
}

// ─── EXPRESSION SIMPLIFIER (log properties, power rules, etc.) ──
function simplifyExpression(eq: string): SolutionData | null {
  const cleaned = eq.replace(/\s+/g, "").toLowerCase();

  // Must contain ln() or log() and a variable, but no = sign
  if (cleaned.includes("=")) return null;
  if (!/(?:ln|log)\(/.test(cleaned)) return null;
  if (!/[a-z]/.test(cleaned)) return null;

  const steps: SolutionStep[] = [];
  const v = (cleaned.match(/[a-z]/) || ["x"])[0];

  steps.push({
    stepNumber: 0, description: "Original expression", operation: "display",
    beforeEquation: eq, afterEquation: eq, termMovements: [], duration: 1200,
  });

  let result = cleaned;
  let stepNum = 1;

  // Rule: ln(a^n) → n·ln(a)  (power rule)
  const powerInLog = result.match(/(ln|log)\(([a-z0-9]+)\^(\d+\.?\d*)\)/);
  if (powerInLog) {
    const [full, logFn, base, exp] = powerInLog;
    const before = result;
    result = result.replace(full, `${exp}${logFn}(${base})`);
    steps.push({
      stepNumber: stepNum++, description: `Power Rule: ${logFn}(${base}^${exp}) = ${exp}·${logFn}(${base})`,
      operation: "simplify", beforeEquation: before, afterEquation: result,
      termMovements: [{ termId: "power", term: `^${exp}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${exp}·`, animationType: "arc", color: "#48dbfb", duration: 1500 }],
      duration: 1500,
    });
  }

  // Rule: ln(a·b) → ln(a) + ln(b)  (product rule)
  const productInLog = result.match(/(ln|log)\(([a-z0-9]+)\*([a-z0-9]+)\)/);
  if (productInLog) {
    const [full, logFn, a, b] = productInLog;
    const before = result;
    result = result.replace(full, `${logFn}(${a})+${logFn}(${b})`);
    steps.push({
      stepNumber: stepNum++, description: `Product Rule: ${logFn}(${a}·${b}) = ${logFn}(${a}) + ${logFn}(${b})`,
      operation: "simplify", beforeEquation: before, afterEquation: result,
      termMovements: [{ termId: "product", term: `${a}·${b}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${logFn}(${a})+${logFn}(${b})`, animationType: "split", color: "#ff6b6b", duration: 1500 }],
      duration: 1500,
    });
  }

  // Rule: ln(a/b) → ln(a) - ln(b)  (quotient rule)
  const quotientInLog = result.match(/(ln|log)\(([a-z0-9]+)\/([a-z0-9]+)\)/);
  if (quotientInLog) {
    const [full, logFn, a, b] = quotientInLog;
    const before = result;
    result = result.replace(full, `${logFn}(${a})-${logFn}(${b})`);
    steps.push({
      stepNumber: stepNum++, description: `Quotient Rule: ${logFn}(${a}/${b}) = ${logFn}(${a}) - ${logFn}(${b})`,
      operation: "simplify", beforeEquation: before, afterEquation: result,
      termMovements: [{ termId: "quotient", term: `${a}/${b}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${logFn}(${a})-${logFn}(${b})`, animationType: "split", color: "#feca57", duration: 1500 }],
      duration: 1500,
    });
  }

  // Simplify coefficients: x·3ln(x) → 3x·ln(x), or 2·3 → 6, etc.
  // Pattern: var followed by number: x3ln → 3xln
  const coeffMerge = result.match(/^([a-z])(\d+)(ln|log)\((.+)\)$/);
  if (coeffMerge) {
    const [, varName, coeff, logFn, inner] = coeffMerge;
    const before = result;
    result = `${coeff}${varName}·${logFn}(${inner})`;
    steps.push({
      stepNumber: stepNum++, description: `Rewrite: ${varName}·${coeff}·${logFn}(${inner}) = ${coeff}${varName}·${logFn}(${inner})`,
      operation: "simplify", beforeEquation: before, afterEquation: result,
      termMovements: [{ termId: "coeff", term: coeff, fromSide: "left", fromIndex: 1, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${coeff}${varName}`, animationType: "slide_down", color: "#54a0ff", duration: 1200 }],
      duration: 1200,
    });
  }

  // Also handle: number before var before log: 3xln(x) is already simplified
  // Handle multiplied coefficients: a*bln → (a*b)ln
  const multiCoeff = result.match(/^(\d+)\*(\d+)([a-z]?)·?(ln|log)\((.+)\)$/);
  if (multiCoeff) {
    const [, a, b, varName, logFn, inner] = multiCoeff;
    const product = parseInt(a) * parseInt(b);
    const before = result;
    result = `${product}${varName}·${logFn}(${inner})`;
    steps.push({
      stepNumber: stepNum++, description: `Multiply coefficients: ${a} × ${b} = ${product}`,
      operation: "simplify", beforeEquation: before, afterEquation: result,
      termMovements: [{ termId: "mult", term: `${a}×${b}`, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "simplify", resultingTerm: `${product}`, animationType: "merge", color: "#ff9ff3", duration: 1200 }],
      duration: 1200,
    });
  }

  // If we only have the original display step, it means we couldn't simplify
  if (steps.length <= 1) return null;

  // Final step
  steps.push({
    stepNumber: stepNum, description: "Simplified expression", operation: "result",
    beforeEquation: result, afterEquation: result,
    termMovements: [{ termId: "final", term: result, fromSide: "left", fromIndex: 0, toSide: "left", toIndex: 0, transformation: "none", resultingTerm: result, animationType: "bounce", color: "#00d2d3", duration: 1500 }],
    duration: 1500, highlight: result,
  });

  // Format for display
  const displayResult = result
    .replace(/\*/g, "·")
    .replace(/ln/g, "ln")
    .replace(/log/g, "log");

  return {
    originalEquation: eq,
    equationType: "simplification",
    variable: v,
    steps,
    solution: { result: displayResult },
    canGraph: false,
  };
}

// ─── MAIN SOLVER ───────────────────────────────────────────────
export function solveEquation(equation: string): SolutionData | null {
  const eq = equation.trim();

  // Factorial (5!, 10!)
  if (/^\d+!$/.test(eq)) {
    const result = solveFactorial(eq);
    if (result) return result;
  }

  // Square root (sqrt(16), √25)
  if (/^(?:sqrt|√)/i.test(eq)) {
    const result = solveSqrt(eq);
    if (result) return result;
  }

  // Percentage (25% of 200)
  if (/%/.test(eq) && /of|\*/i.test(eq)) {
    const result = solvePercentage(eq);
    if (result) return result;
  }

  // Trig (sin(30), cos(60°))
  if (/^(sin|cos|tan)\(/i.test(eq)) {
    const result = solveTrig(eq);
    if (result) return result;
  }

  // Power without variable (2^8, 3^4)
  if (/^\d+\.?\d*\^\d+\.?\d*$/.test(eq.replace(/\s+/g, ""))) {
    const result = solvePower(eq);
    if (result) return result;
  }

  // Plain arithmetic (no variable, no equals sign)
  if (!eq.includes("=") && !/[a-z]/i.test(eq)) {
    const result = solveArithmetic(eq);
    if (result) return result;
  }

  // Try exponential first (a^x = b)
  if (/\d\^[a-z]\s*=/.test(eq)) {
    const result = solveExponential(eq);
    if (result) return result;
  }

  // Try logarithmic (log(x), ln(x))
  if (/^(log|ln)\(/.test(eq.toLowerCase())) {
    const result = solveLogarithmic(eq);
    if (result) return result;
  }

  // Try rational ((ax+b)/(cx+d) = e)
  if (/\(.+\)\/\(.+\)\s*=/.test(eq)) {
    const result = solveRational(eq);
    if (result) return result;
  }

  // Try quadratic (x^2, x²)
  if (/[a-z]\^2|[a-z]²/.test(eq.toLowerCase())) {
    const result = solveQuadratic(eq);
    if (result) return result;
  }

  // Try linear
  const result = solveLinear(eq);
  if (result) return result;

  // Try multi-variable (x^2+y^3+9=0, 2x+3y=12, etc.)
  if (eq.includes("=")) {
    const mvResult = solveMultiVariable(eq);
    if (mvResult) return mvResult;
  }

  // Try expression simplification (xln(x^3), log properties, etc.)
  const simpResult = simplifyExpression(eq);
  if (simpResult) return simpResult;

  return null;
}
