import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Emulator-backed rules tests (GS-074).
 *
 * Kept out of `vitest.config.ts` on purpose: these need a running Firestore
 * emulator, so `npm test` must not pick them up and fail on a machine that has
 * none. Run them with `npm run test:rules`, which starts the emulator around
 * the suite via `firebase emulators:exec`.
 *
 * Timeouts are generous because the first request pays for the emulator's
 * rules compilation.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    include: ["firestore/**/*.rules.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // One emulator, one rules deployment - parallel files would race on the
    // shared project state that clearFirestore() resets between tests.
    fileParallelism: false,
  },
});
