/**
 * SPENDLY-638 — where `lib/firestore.native.ts` keeps the plain elements of a
 * native `arrayUnion` / `arrayRemove`, so `lib/firestoreSentinel.ts` can
 * serialise them for the write outbox. Its own module so the two can share it
 * without an import cycle (the sentinel module imports the adapter).
 */
export const NATIVE_ARRAY_ELEMENTS_KEY = "__spendlyElements";
