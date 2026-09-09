/**
 * Ganesh Seva localization — the pure resolution layer.
 *
 * Everything here is a plain function over plain records so it can be unit
 * tested without a React tree, a Firestore mock or a loaded font. The provider
 * (`providers/GaneshI18nProvider.tsx`) is a thin shell over these.
 *
 * Two rules drive the design:
 *
 * 1. **Fallback is per key, never per language.** A half-reviewed Telugu
 *    catalog must degrade to English one string at a time. Swapping the whole
 *    catalog on the first gap would make a single missing key flip a screen
 *    back to English, which reads like a bug.
 * 2. **A message never renders as `undefined` or blank.** Missing, empty and
 *    whitespace-only values all fall through, and an unresolved placeholder is
 *    left verbatim so it is visible in review rather than silently empty.
 */

import { type GaneshLanguage } from "./types";

export type GaneshMessages = Record<string, string>;

export type InterpolationParams = Record<string, string | number>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Substitutes `{{name}}` placeholders.
 *
 * An unknown placeholder is left exactly as written. Printing `undefined` into
 * a committee-facing sentence is worse than showing the raw token, and the raw
 * token tells whoever spots it which param is missing.
 */
export function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/** The placeholder names a message expects, in first-seen order, deduplicated. */
export function placeholdersIn(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

function usable(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolves one key against the active catalog, then English, then the key.
 *
 * Returning the key rather than an empty string is deliberate: an untranslated
 * screen should look obviously unfinished to whoever is reviewing it, not
 * plausibly blank.
 */
export function resolveMessage(
  key: string,
  active: GaneshMessages | undefined,
  fallback: GaneshMessages
): string {
  const fromActive = active?.[key];
  if (usable(fromActive)) return fromActive;
  const fromFallback = fallback[key];
  if (usable(fromFallback)) return fromFallback;
  return key;
}

export function translate(
  key: string,
  active: GaneshMessages | undefined,
  fallback: GaneshMessages,
  params?: InterpolationParams
): string {
  return interpolate(resolveMessage(key, active, fallback), params);
}

/**
 * Picks the plural form for a count.
 *
 * All six languages Ganesh Seva ships have exactly two CLDR cardinal
 * categories, so a table beats pulling in a plural-rules library. They are not
 * all the *same* two rules, though: Hindi puts zero in `one` ("0 सदस्य" takes
 * the singular), while English, Telugu, Tamil, Kannada and Malayalam put it in
 * `other`. Getting that wrong is a silent grammar bug, not a crash, so the
 * distinction is encoded rather than assumed.
 *
 * Deliberately not `Intl.PluralRules`: Hermes on Android delegates to the
 * platform's ICU data, whose locale coverage for these scripts is uneven, so
 * the answer would vary by device. Six known languages in a table are provable
 * by unit test instead.
 *
 * CLDR cardinal rules, r45: hi `i = 0 or n = 1`; en/te/ta/kn/ml `n = 1`.
 */
export function pluralSuffix(language: GaneshLanguage, count: number): "_one" | "_other" {
  const n = Math.abs(count);
  if (language === "hi") return n === 0 || n === 1 ? "_one" : "_other";
  return n === 1 ? "_one" : "_other";
}

export function translatePlural(
  key: string,
  count: number,
  language: GaneshLanguage,
  active: GaneshMessages | undefined,
  fallback: GaneshMessages,
  params?: InterpolationParams
): string {
  return translate(`${key}${pluralSuffix(language, count)}`, active, fallback, {
    count,
    ...params,
  });
}
