/**
 * English is the source of truth for Ganesh Seva's message keys.
 *
 * `shared/i18n/ganesh/keys.ts` derives `GaneshMessageKey` from this object, so
 * every other language is typed against it: a missing key or a key that does
 * not exist in English is a `npm run typecheck` failure, not a runtime
 * surprise. Add a key here first, then to the five translations.
 *
 * Namespaces are added as each screen area is migrated off inline literals.
 */
import { common } from "./common";
import { language } from "./language";
import { nav } from "./nav";

export const en = {
  ...common,
  ...language,
  ...nav,
} as const;
