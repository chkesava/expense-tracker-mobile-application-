/**
 * Catalog loading.
 *
 * English is imported statically because it is the fallback for every key and
 * so is needed on the first render regardless of the member's language. The
 * other five are behind `import()`.
 *
 * Honest limit: on web that becomes a real deferred chunk, but Metro bundles
 * every dynamic import into the native binary, so on Android and iOS the win is
 * parse time rather than download size. Six catalogs of short strings are cheap
 * either way — this split exists mainly so the catalogs stay out of the Expense
 * Tracker and Nutrition Tracker entry graphs entirely.
 */
import { en } from "./en";
import { type GaneshMessages } from "./runtime";
import { type GaneshLanguage } from "./types";

const LOADERS: Record<GaneshLanguage, () => Promise<GaneshMessages>> = {
  en: async () => en,
  hi: () => import("./hi").then((m) => m.hi),
  te: () => import("./te").then((m) => m.te),
  ta: () => import("./ta").then((m) => m.ta),
  kn: () => import("./kn").then((m) => m.kn),
  ml: () => import("./ml").then((m) => m.ml),
};

const cache = new Map<GaneshLanguage, GaneshMessages>();
cache.set("en", en);

/** The English catalog, always available synchronously. */
export const fallbackMessages: GaneshMessages = en;

/** Already-resolved catalog for a language, if one has been loaded. */
export function cachedCatalog(language: GaneshLanguage): GaneshMessages | undefined {
  return cache.get(language);
}

/**
 * Loads a catalog, memoized.
 *
 * A failed chunk load resolves to English rather than rejecting: a member whose
 * network dropped mid-load should get a usable English app, not a blank screen.
 */
export async function loadCatalog(language: GaneshLanguage): Promise<GaneshMessages> {
  const hit = cache.get(language);
  if (hit) return hit;
  try {
    const messages = await LOADERS[language]();
    cache.set(language, messages);
    return messages;
  } catch {
    return en;
  }
}
