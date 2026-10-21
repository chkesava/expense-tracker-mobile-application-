import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-504 — the read model's service-role key must never reach the app
 * bundle. It lives only in GitHub Actions secrets for the sync job
 * (SPENDLY-506). Sibling of services/ganesh/storage/storageSecurity.test.ts.
 */
const root = path.resolve(__dirname, "..");

/** Names reserved for the read model's server-side secrets. */
const READMODEL_SECRET_NAMES = [
  "READMODEL_SUPABASE_SERVICE_ROLE_KEY",
  "READMODEL_SUPABASE_DB_URL",
  "READMODEL_FIREBASE_SERVICE_ACCOUNT",
];

/** Everything that is bundled into the Expo app, plus env templates. */
const APP_DIRS = ["app", "components", "hooks", "lib", "providers", "services", "shared", "features", "theme"];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("read-model secrets (SPENDLY-504)", () => {
  const appSource = APP_DIRS.flatMap((dir) => sourceFiles(path.join(root, dir)))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  it("keeps the read-model server secrets out of app code", () => {
    for (const name of READMODEL_SECRET_NAMES) expect(appSource).not.toContain(name);
  });

  it("exposes only the publishable read-model values as EXPO_PUBLIC_ variables", () => {
    const envFiles = [".env.example", "lib/env.ts", "app.config.ts", "app.config.js"]
      .map((rel) => path.join(root, rel))
      .filter(existsSync)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    // SPENDLY-505: the URL and publishable key are public by design (RLS and
    // the user's Firebase token do the authorising). Nothing else may be.
    const allowed = ["EXPO_PUBLIC_READMODEL_SUPABASE_URL", "EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY"];
    for (const name of envFiles.match(/EXPO_PUBLIC_[A-Z0-9_]*READMODEL[A-Z0-9_]*/g) ?? []) {
      expect(allowed).toContain(name);
    }
    expect(envFiles).not.toMatch(/EXPO_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|DB_URL|SERVICE_ACCOUNT)/);
  });

  it("contains no Supabase secret or service-role key literal (SPENDLY-505)", () => {
    const scanned = [appSource, ...[".env.example"].map((rel) => path.join(root, rel)).filter(existsSync).map((f) => readFileSync(f, "utf8"))].join("\n");
    // New-style secret keys.
    expect(scanned).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}/);
    // Legacy JWT keys: decode every JWT-shaped literal and check its role.
    for (const [, payload] of scanned.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      expect(Buffer.from(payload, "base64url").toString("utf8")).not.toContain("service_role");
    }
    // A service-role client option in app code.
    expect(scanned).not.toMatch(/serviceRole\s*:/);
  });
});
