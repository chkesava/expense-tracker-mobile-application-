/**
 * Ganesh Seva localization — language and script identity.
 *
 * Ganesh Seva is a pandal platform, and the people who use it are committee
 * members, ward collectors and household contributors who are often not
 * comfortable reading English. Unlike a consumer app they also cannot be told
 * to "change it in settings" — so a pandal **admin** assigns a language to each
 * member the same way they assign a role. Nothing here is device-locale driven.
 *
 * Scoped to Ganesh on purpose: Expense Tracker has its own, unrelated
 * `providers/LocalizationProvider.tsx`, and neither product may pull in the
 * other's catalogs.
 */

export const GANESH_LANGUAGES = ["en", "hi", "te", "ta", "kn", "ml"] as const;

export type GaneshLanguage = (typeof GANESH_LANGUAGES)[number];

export const DEFAULT_GANESH_LANGUAGE: GaneshLanguage = "en";

/**
 * The writing system a language needs, which is what decides the font family.
 * Several languages could share one script, so this is deliberately a separate
 * axis from `GaneshLanguage`.
 */
export type GaneshScript =
  | "latin"
  | "devanagari"
  | "telugu"
  | "tamil"
  | "kannada"
  | "malayalam";

export type GaneshLanguageMeta = {
  /** Shown in the picker, in the language's own script. */
  nativeLabel: string;
  /** Shown alongside, so an admin who reads only English can still choose. */
  englishLabel: string;
  script: GaneshScript;
};

export const GANESH_LANGUAGE_META: Record<GaneshLanguage, GaneshLanguageMeta> = {
  en: { nativeLabel: "English", englishLabel: "English", script: "latin" },
  hi: { nativeLabel: "हिन्दी", englishLabel: "Hindi", script: "devanagari" },
  te: { nativeLabel: "తెలుగు", englishLabel: "Telugu", script: "telugu" },
  ta: { nativeLabel: "தமிழ்", englishLabel: "Tamil", script: "tamil" },
  kn: { nativeLabel: "ಕನ್ನಡ", englishLabel: "Kannada", script: "kannada" },
  ml: { nativeLabel: "മലയാളം", englishLabel: "Malayalam", script: "malayalam" },
};

/** Narrows an unknown Firestore value to a language we actually ship. */
export function isGaneshLanguage(value: unknown): value is GaneshLanguage {
  return typeof value === "string" && (GANESH_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Firestore is the source of truth for a member's language, so every read has
 * to tolerate an unset field, an old value, or a typo written by a script.
 */
export function coerceGaneshLanguage(
  value: unknown,
  fallback: GaneshLanguage = DEFAULT_GANESH_LANGUAGE
): GaneshLanguage {
  return isGaneshLanguage(value) ? value : fallback;
}

export function ganeshScriptFor(language: GaneshLanguage): GaneshScript {
  return GANESH_LANGUAGE_META[language].script;
}
