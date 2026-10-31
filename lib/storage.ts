/**
 * SPENDLY-637 — the one Firebase Storage import path for app code
 * (`lib/firebaseImportGuard.test.ts`). This file is the web/vitest side (JS
 * SDK); Android/iOS resolve `storage.native.ts` (SPENDLY-638), because
 * `releases/` reads require `request.auth`, which only the SDK that signed in
 * can supply.
 */
export * from "firebase/storage";
