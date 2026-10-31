/**
 * Fallback for TypeScript and vitest resolution (Metro picks `.web` at
 * runtime). Native builds no longer create a JS-SDK Auth at all: since
 * SPENDLY-638 they use the native SDK via `lib/firebase.native.ts`, which
 * persists its own session.
 */
export { createAuth } from "./createAuth.web";
