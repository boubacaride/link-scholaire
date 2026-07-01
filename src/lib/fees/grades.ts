// Canonical francophone West-African class ladder, ordered 1st → 13th grade.
// The UI shows the CLASS NAME only (not the grade number). Used by the
// admin "Tuition by class" settings and anywhere fees are keyed by class.

export const FRENCH_GRADES = [
  "CI",         // 1st grade
  "CP",         // 2nd
  "CE1",        // 3rd
  "CE2",        // 4th
  "CM1",        // 5th
  "CM2",        // 6th
  "Sixième",    // 7th
  "Cinquième",  // 8th
  "Quatrième",  // 9th
  "Troisième",  // 10th
  "Seconde",    // 11th
  "Première",   // 12th
  "Terminale",  // 13th
] as const;

export type FrenchGrade = (typeof FRENCH_GRADES)[number];
