import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    include: [
      "shared/**/*.test.ts",
      "services/**/*.test.ts",
      "lib/**/*.test.ts",
      "services/sms/**/*.test.ts",
      // The ganesh-files Edge Function's authorization logic (GS-096). It lives
      // outside the app tree and is excluded from tsconfig because it deploys to
      // Deno, but handler.ts is deliberately plain TypeScript so its rules are
      // provable here rather than only against a deployed function.
      "supabase/functions/**/*.test.ts",
    ],
    environment: "node",
  },
});
