// Level-aware vocabulary: same operation sounds different at every level

import type { Level } from "./levelDetector";

type VocabEntry = { text: string; voice: string };

interface OperationPhrases {
  add: VocabEntry;
  subtract: VocabEntry;
  multiply: VocabEntry;
  divide: VocabEntry;
  simplify: VocabEntry;
  factor: VocabEntry;
  substitute: VocabEntry;
  solve: VocabEntry;
  answer: VocabEntry;
  takeRoot: VocabEntry;
  distribute: VocabEntry;
  combine: VocabEntry;
  differentiate: VocabEntry;
  integrate: VocabEntry;
  limit: VocabEntry;
  eigenvalue: VocabEntry;
  rowReduce: VocabEntry;
}

const VOCAB: Record<Level, OperationPhrases> = {
  "K-2": {
    add:           { text: "We add to both sides! ➕", voice: "Let's add to both sides, like sharing equally!" },
    subtract:      { text: "We take away from both sides! ➖", voice: "Let's take away from each side!" },
    multiply:      { text: "We multiply both sides! ✖️", voice: "Let's multiply both sides!" },
    divide:        { text: "We split both sides equally! ➗", voice: "Let's split both sides into equal groups!" },
    simplify:      { text: "Let's make it simpler! ✨", voice: "Now let's make it simpler!" },
    factor:        { text: "Let's find what's hidden inside!", voice: "Let's find what's hiding inside!" },
    substitute:    { text: "Let's swap in a number!", voice: "Let's swap in a number!" },
    solve:         { text: "Let's find the answer! 🎯", voice: "Let's find the answer!" },
    answer:        { text: "We found it! 🎉", voice: "Yay! We found it!" },
    takeRoot:      { text: "Let's find the special number!", voice: "Let's find that special number!" },
    distribute:    { text: "Let's share with everything inside!", voice: "Let's share with everything inside!" },
    combine:       { text: "Let's put the same things together!", voice: "Let's put the same things together!" },
    differentiate: { text: "Let's see how it changes!", voice: "Let's see how it changes!" },
    integrate:     { text: "Let's add it all up!", voice: "Let's add it all up!" },
    limit:         { text: "Let's see what happens!", voice: "Let's see what happens!" },
    eigenvalue:    { text: "Let's find the special values!", voice: "Let's find the special values!" },
    rowReduce:     { text: "Let's organize the rows!", voice: "Let's organize the rows!" },
  },
  "3-5": {
    add:           { text: "We add to both sides to keep the equation balanced.", voice: "We add to both sides." },
    subtract:      { text: "We subtract from both sides to get closer to the answer.", voice: "We subtract from both sides." },
    multiply:      { text: "We multiply both sides.", voice: "We multiply both sides." },
    divide:        { text: "We divide both sides so the variable is alone.", voice: "We divide both sides." },
    simplify:      { text: "Now let's simplify.", voice: "Now let's simplify." },
    factor:        { text: "Let's factor this expression.", voice: "Let's factor this." },
    substitute:    { text: "We substitute the value in.", voice: "We plug in the value." },
    solve:         { text: "Let's solve for the variable.", voice: "Let's solve for the variable." },
    answer:        { text: "We found the answer! ✓", voice: "We found the answer!" },
    takeRoot:      { text: "We take the square root of both sides.", voice: "We take the square root of both sides." },
    distribute:    { text: "We distribute to each term inside.", voice: "We distribute to each term." },
    combine:       { text: "We combine like terms.", voice: "We combine like terms." },
    differentiate: { text: "We find the derivative.", voice: "We find the derivative." },
    integrate:     { text: "We find the integral.", voice: "We find the integral." },
    limit:         { text: "We evaluate the limit.", voice: "We evaluate the limit." },
    eigenvalue:    { text: "We find the eigenvalues.", voice: "We find the eigenvalues." },
    rowReduce:     { text: "We row reduce the matrix.", voice: "We row reduce the matrix." },
  },
  "6-8": {
    add:           { text: "Add to both sides of the equation.", voice: "Add to both sides." },
    subtract:      { text: "Subtract from both sides to isolate the term.", voice: "Subtract from both sides." },
    multiply:      { text: "Multiply both sides.", voice: "Multiply both sides." },
    divide:        { text: "Divide both sides to isolate the variable.", voice: "Divide both sides." },
    simplify:      { text: "Simplify the expression.", voice: "Simplify." },
    factor:        { text: "Factor the expression.", voice: "Factor the expression." },
    substitute:    { text: "Substitute the value.", voice: "Substitute the value." },
    solve:         { text: "Solve for the variable.", voice: "Solve for the variable." },
    answer:        { text: "Solution found. ✓", voice: "Solution found." },
    takeRoot:      { text: "Take the square root of both sides.", voice: "Take the square root." },
    distribute:    { text: "Distribute across the parentheses.", voice: "Distribute." },
    combine:       { text: "Combine like terms.", voice: "Combine like terms." },
    differentiate: { text: "Differentiate with respect to the variable.", voice: "Differentiate." },
    integrate:     { text: "Integrate the expression.", voice: "Integrate." },
    limit:         { text: "Evaluate the limit.", voice: "Evaluate the limit." },
    eigenvalue:    { text: "Find the eigenvalues.", voice: "Find the eigenvalues." },
    rowReduce:     { text: "Apply row reduction.", voice: "Row reduce." },
  },
  "9-10": {
    add:           { text: "Add to both sides.", voice: "" },
    subtract:      { text: "Subtract from both sides.", voice: "" },
    multiply:      { text: "Multiply both sides.", voice: "" },
    divide:        { text: "Divide both sides.", voice: "" },
    simplify:      { text: "Simplify.", voice: "" },
    factor:        { text: "Factor.", voice: "" },
    substitute:    { text: "Substitute.", voice: "" },
    solve:         { text: "Solve.", voice: "" },
    answer:        { text: "Answer:", voice: "" },
    takeRoot:      { text: "Take roots.", voice: "" },
    distribute:    { text: "Distribute.", voice: "" },
    combine:       { text: "Combine like terms.", voice: "" },
    differentiate: { text: "Differentiate.", voice: "" },
    integrate:     { text: "Integrate.", voice: "" },
    limit:         { text: "Evaluate the limit.", voice: "" },
    eigenvalue:    { text: "Find eigenvalues.", voice: "" },
    rowReduce:     { text: "Row reduce.", voice: "" },
  },
  "11-12": {
    add:           { text: "Add to both sides.", voice: "" },
    subtract:      { text: "Subtract from both sides.", voice: "" },
    multiply:      { text: "Multiply both sides.", voice: "" },
    divide:        { text: "Divide both sides.", voice: "" },
    simplify:      { text: "Simplify.", voice: "" },
    factor:        { text: "Factor.", voice: "" },
    substitute:    { text: "Substitute.", voice: "" },
    solve:         { text: "Solve.", voice: "" },
    answer:        { text: "∴ Answer:", voice: "" },
    takeRoot:      { text: "Take roots.", voice: "" },
    distribute:    { text: "Distribute.", voice: "" },
    combine:       { text: "Combine like terms.", voice: "" },
    differentiate: { text: "Apply differentiation.", voice: "" },
    integrate:     { text: "Integrate.", voice: "" },
    limit:         { text: "Evaluate limit.", voice: "" },
    eigenvalue:    { text: "Compute eigenvalues.", voice: "" },
    rowReduce:     { text: "Row echelon form.", voice: "" },
  },
  "undergrad": {
    add:           { text: "Apply additive operation to both sides.", voice: "" },
    subtract:      { text: "Subtract from both sides.", voice: "" },
    multiply:      { text: "Multiply both sides.", voice: "" },
    divide:        { text: "Divide both sides.", voice: "" },
    simplify:      { text: "Simplify.", voice: "" },
    factor:        { text: "Factor.", voice: "" },
    substitute:    { text: "By substitution.", voice: "" },
    solve:         { text: "Solving.", voice: "" },
    answer:        { text: "∴", voice: "" },
    takeRoot:      { text: "Extract roots.", voice: "" },
    distribute:    { text: "Distribute.", voice: "" },
    combine:       { text: "Collect terms.", voice: "" },
    differentiate: { text: "Differentiate.", voice: "" },
    integrate:     { text: "Integrate.", voice: "" },
    limit:         { text: "Evaluate.", voice: "" },
    eigenvalue:    { text: "Eigenvalue computation.", voice: "" },
    rowReduce:     { text: "RREF.", voice: "" },
  },
  "grad": {
    add:           { text: "By the additive inverse.", voice: "" },
    subtract:      { text: "Subtract.", voice: "" },
    multiply:      { text: "Scale.", voice: "" },
    divide:        { text: "Divide.", voice: "" },
    simplify:      { text: "Simplify.", voice: "" },
    factor:        { text: "Factor.", voice: "" },
    substitute:    { text: "Substitution.", voice: "" },
    solve:         { text: "Solve.", voice: "" },
    answer:        { text: "∎", voice: "" },
    takeRoot:      { text: "Extract.", voice: "" },
    distribute:    { text: "Expand.", voice: "" },
    combine:       { text: "Collect.", voice: "" },
    differentiate: { text: "d/dx.", voice: "" },
    integrate:     { text: "∫.", voice: "" },
    limit:         { text: "lim.", voice: "" },
    eigenvalue:    { text: "λ-computation.", voice: "" },
    rowReduce:     { text: "Gaussian elimination.", voice: "" },
  },
};

export type OperationKey = keyof OperationPhrases;

/**
 * Get the appropriate phrase for an operation at a given level.
 */
export function phraseFor(operation: OperationKey, level: Level): VocabEntry {
  return VOCAB[level][operation];
}

/**
 * Detect operation type from a step description.
 */
export function detectOperation(description: string): OperationKey {
  const d = description.toLowerCase();
  if (d.includes("add")) return "add";
  if (d.includes("subtract") || d.includes("take away")) return "subtract";
  if (d.includes("multiply") || d.includes("scale")) return "multiply";
  if (d.includes("divide") || d.includes("split")) return "divide";
  if (d.includes("simplif")) return "simplify";
  if (d.includes("factor")) return "factor";
  if (d.includes("substitut") || d.includes("plug")) return "substitute";
  if (d.includes("root") || d.includes("sqrt")) return "takeRoot";
  if (d.includes("distribut") || d.includes("expand")) return "distribute";
  if (d.includes("combine") || d.includes("collect")) return "combine";
  if (d.includes("differenti") || d.includes("derivative") || d.includes("d/dx")) return "differentiate";
  if (d.includes("integrat") || d.includes("antiderivat")) return "integrate";
  if (d.includes("limit") || d.includes("lim")) return "limit";
  if (d.includes("eigenvalue") || d.includes("eigen")) return "eigenvalue";
  if (d.includes("row reduc") || d.includes("echelon") || d.includes("gaussian")) return "rowReduce";
  if (d.includes("answer") || d.includes("solution") || d.includes("result")) return "answer";
  if (d.includes("solve")) return "solve";
  return "simplify";
}
