// Absence Excuse / Extended Absence Requests translations (parent/student
// facing) + the school-level absence-policy settings. Namespace: abs.*
export const dict = {
  en: {
    abs: {
      // School onboarding + settings
      educationStage: "Education stage",
      stageK12: "K-12 (parents submit excuses)",
      stageHigherEd: "Higher education (students submit for themselves)",
      stageHint: "Determines who can submit absence excuses. K-12: parents, on behalf of a child. Higher education: students, for themselves.",
      settingsTitle: "Absence policy",
      settingsHint: "Controls how absence excuses and extended-absence requests work for this school.",
      requireApprovalAll: "Require admin approval for all absences",
      requireApprovalAllHint: "When on, even a single-day excuse must be approved by an administrator before it takes effect.",
      extendedDays: "Extended-absence threshold (days)",
      extendedDaysHint: "An absence of this many days or more becomes an Extended Absence Request that needs admin approval.",
      adminOnly: "Only administrators can change these settings.",
      save: "Save",
      saving: "Saving…",
      saved: "Saved",
      loadError: "Could not load settings.",
    },
  },
  fr: {
    abs: {
      educationStage: "Niveau d'enseignement",
      stageK12: "Primaire/Secondaire (les parents soumettent)",
      stageHigherEd: "Enseignement supérieur (les étudiants soumettent eux-mêmes)",
      stageHint: "Détermine qui peut soumettre des justificatifs d'absence. Primaire/Secondaire : les parents, pour un enfant. Supérieur : les étudiants, pour eux-mêmes.",
      settingsTitle: "Politique d'absence",
      settingsHint: "Contrôle le fonctionnement des justificatifs et des demandes d'absence prolongée pour cette école.",
      requireApprovalAll: "Exiger l'approbation de l'administrateur pour toutes les absences",
      requireApprovalAllHint: "Si activé, même un justificatif d'un seul jour doit être approuvé par un administrateur avant de prendre effet.",
      extendedDays: "Seuil d'absence prolongée (jours)",
      extendedDaysHint: "Une absence d'au moins ce nombre de jours devient une demande d'absence prolongée nécessitant l'approbation de l'administrateur.",
      adminOnly: "Seuls les administrateurs peuvent modifier ces paramètres.",
      save: "Enregistrer",
      saving: "Enregistrement…",
      saved: "Enregistré",
      loadError: "Impossible de charger les paramètres.",
    },
  },
  ar: {} as Record<string, unknown>,
};
