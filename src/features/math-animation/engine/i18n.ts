// Internationalization for the math animation engine
// Supports: English, French, Arabic

export type Locale = "en" | "fr" | "ar";

interface TranslationStrings {
  // Playback controls
  play: string;
  pause: string;
  next: string;
  prev: string;
  replay: string;
  showAll: string;
  stepOf: string;  // "Step {n} of {total}"

  // Step labels
  step: string;
  solution: string;
  answer: string;
  verification: string;

  // Operations
  add: string;
  subtract: string;
  multiply: string;
  divide: string;
  simplify: string;
  factor: string;
  solve: string;

  // Level names
  levelK2: string;
  level35: string;
  level68: string;
  level910: string;
  level1112: string;
  levelUndergrad: string;
  levelGrad: string;

  // Voice
  voiceOn: string;
  voiceOff: string;

  // UI
  animatedSolution: string;
  poweredBy: string;
  speed: string;
  autoDetected: string;
}

const translations: Record<Locale, TranslationStrings> = {
  en: {
    play: "Play", pause: "Pause", next: "Next", prev: "Prev",
    replay: "Replay", showAll: "Show All",
    stepOf: "Step {n} of {total}",
    step: "STEP", solution: "Solution", answer: "Answer", verification: "Verification",
    add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide",
    simplify: "Simplify", factor: "Factor", solve: "Solve",
    levelK2: "K-2", level35: "3-5", level68: "6-8", level910: "9-10",
    level1112: "11-12", levelUndergrad: "Undergrad", levelGrad: "Graduate",
    voiceOn: "Voice On", voiceOff: "Voice Off",
    animatedSolution: "Animated Step-by-Step Solution",
    poweredBy: "Powered by Wolfram Alpha",
    speed: "Speed",
    autoDetected: "Auto-detected level",
  },
  fr: {
    play: "Lecture", pause: "Pause", next: "Suivant", prev: "Précédent",
    replay: "Rejouer", showAll: "Tout afficher",
    stepOf: "Étape {n} sur {total}",
    step: "ÉTAPE", solution: "Solution", answer: "Réponse", verification: "Vérification",
    add: "Additionner", subtract: "Soustraire", multiply: "Multiplier", divide: "Diviser",
    simplify: "Simplifier", factor: "Factoriser", solve: "Résoudre",
    levelK2: "CP-CE1", level35: "CE2-CM2", level68: "6e-3e", level910: "2nde-1ère",
    level1112: "Terminale", levelUndergrad: "Licence", levelGrad: "Master/Doctorat",
    voiceOn: "Voix activée", voiceOff: "Voix désactivée",
    animatedSolution: "Solution animée étape par étape",
    poweredBy: "Propulsé par Wolfram Alpha",
    speed: "Vitesse",
    autoDetected: "Niveau détecté automatiquement",
  },
  ar: {
    play: "تشغيل", pause: "إيقاف", next: "التالي", prev: "السابق",
    replay: "إعادة", showAll: "عرض الكل",
    stepOf: "الخطوة {n} من {total}",
    step: "الخطوة", solution: "الحل", answer: "الإجابة", verification: "التحقق",
    add: "جمع", subtract: "طرح", multiply: "ضرب", divide: "قسمة",
    simplify: "تبسيط", factor: "تحليل", solve: "حل",
    levelK2: "ابتدائي ١-٢", level35: "ابتدائي ٣-٥", level68: "متوسط",
    level910: "ثانوي ١-٢", level1112: "ثانوي ٣", levelUndergrad: "جامعي", levelGrad: "دراسات عليا",
    voiceOn: "الصوت مفعل", voiceOff: "الصوت معطل",
    animatedSolution: "حل متحرك خطوة بخطوة",
    poweredBy: "مدعوم بواسطة وولفرام ألفا",
    speed: "السرعة",
    autoDetected: "المستوى المكتشف تلقائياً",
  },
};

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: keyof TranslationStrings, vars?: Record<string, string | number>): string {
  let text = translations[currentLocale][key] || translations.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function isRTL(): boolean {
  return currentLocale === "ar";
}

/** Get voice language code for SpeechSynthesis */
export function getVoiceLang(): string {
  switch (currentLocale) {
    case "fr": return "fr-FR";
    case "ar": return "ar-SA";
    default: return "en-US";
  }
}
