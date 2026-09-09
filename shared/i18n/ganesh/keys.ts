import { en } from "./en";
import { type GaneshMessages } from "./runtime";

/** Every message key Ganesh Seva ships, derived from the English catalog. */
export type GaneshMessageKey = keyof typeof en;

/**
 * The shape one translated namespace must satisfy: the same keys as its English
 * counterpart, with free-form string values.
 *
 * Declared per namespace rather than once over the whole catalog so that a key
 * a translator missed is reported in `te/funds.ts` at the offending line,
 * instead of as one error on the composed object in `te/index.ts`. `Record`
 * over `keyof En` also makes an *invented* key an error, via the
 * excess-property check on an object literal with a declared type — so a
 * reviewer editing a translation cannot silently drift from English in either
 * direction.
 */
export type NsOf<TEnglishNamespace> = Record<keyof TEnglishNamespace, string>;

/**
 * The shape every non-English catalog must satisfy.
 *
 * `Record` rather than `Partial<Record>` on purpose: an incomplete translation
 * should fail the typecheck while it is still cheap to fix. The runtime still
 * falls back per key (see `runtime.ts`) so a bad *value* degrades gracefully,
 * but a bad *key set* is caught in CI.
 */
export type GaneshCatalog = Record<GaneshMessageKey, string>;

/** The English catalog widened for the runtime's plain-record signatures. */
export const englishMessages: GaneshMessages = en;

/**
 * Plural keys are authored as a `_one` / `_other` pair, and `tn()` appends the
 * suffix. This extracts the stems so callers pass `"people.count"`, not
 * `"people.count_one"`.
 */
export type GaneshPluralKey = GaneshMessageKey extends infer K
  ? K extends `${infer Stem}_other`
    ? Stem
    : never
  : never;
