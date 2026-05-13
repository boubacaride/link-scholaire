// Convert MathQuill LaTeX output to a simple equation string our solver can parse

export function latexToEquation(latex: string): string {
  let eq = latex;

  // Fractions: \frac{a}{b} → (a)/(b)
  eq = eq.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

  // Square root: \sqrt{x} → sqrt(x)
  eq = eq.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");

  // Powers: x^{2} → x^2
  eq = eq.replace(/\^{([^}]+)}/g, "^$1");

  // Subscripts (remove for now)
  eq = eq.replace(/_{([^}]+)}/g, "");

  // Functions
  eq = eq.replace(/\\sin/g, "sin");
  eq = eq.replace(/\\cos/g, "cos");
  eq = eq.replace(/\\tan/g, "tan");
  eq = eq.replace(/\\log/g, "log");
  eq = eq.replace(/\\ln/g, "ln");

  // Symbols
  eq = eq.replace(/\\pi/g, "π");
  eq = eq.replace(/\\infty/g, "∞");
  eq = eq.replace(/\\pm/g, "±");
  eq = eq.replace(/\\times/g, "*");
  eq = eq.replace(/\\div/g, "/");
  eq = eq.replace(/\\cdot/g, "*");
  eq = eq.replace(/\\leq/g, "<=");
  eq = eq.replace(/\\geq/g, ">=");
  eq = eq.replace(/\\neq/g, "!=");

  // Comparisons
  eq = eq.replace(/\\le/g, "<=");
  eq = eq.replace(/\\ge/g, ">=");

  // Remove remaining LaTeX commands
  eq = eq.replace(/\\left/g, "");
  eq = eq.replace(/\\right/g, "");
  eq = eq.replace(/\\ /g, " ");
  eq = eq.replace(/\\,/g, "");

  // Clean up spaces
  eq = eq.replace(/\s+/g, "");

  // Handle implicit multiplication: 2x → 2x (already works for our solver)
  // Handle ²: convert to ^2
  eq = eq.replace(/²/g, "^2");
  eq = eq.replace(/³/g, "^3");

  return eq;
}
