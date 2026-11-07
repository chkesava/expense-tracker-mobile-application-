import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { API_FUNCTIONS, netlifyRedirects } from "../scripts/lib/webHosting";
import { BACKUP_FUNCTIONS, NETLIFY_ONLY_FUNCTIONS } from "./functions";

/**
 * SPENDLY-703 / D5: every deployed Netlify function is either run by the
 * Cloudflare backup or explicitly Netlify-only. A new function must be put in
 * one list (cloudflare/functions.ts) before this passes.
 */
const root = path.resolve(__dirname, "..");
const { FUNCTIONS } = createRequire(__filename)(path.join(root, "scripts", "bundle-netlify-fns.js")) as { FUNCTIONS: string[] };

describe("the backup's function list", () => {
  const served = Object.keys(BACKUP_FUNCTIONS);
  const netlifyOnly = Object.keys(NETLIFY_ONLY_FUNCTIONS);

  it("classifies every deployed Netlify function exactly once", () => {
    expect([...served, ...netlifyOnly].sort()).toEqual([...FUNCTIONS].sort());
    expect(served.filter((name) => netlifyOnly.includes(name))).toEqual([]);
  });

  it("never runs a function that needs Firestore Admin", () => {
    for (const name of served) {
      const source = readFileSync(path.join(root, "netlify", "functions", `${name}.ts`), "utf8");
      expect(source, name).not.toContain("firebase-admin/firestore");
    }
  });

  it("routes the same /api names as Netlify's _redirects", () => {
    const fromRedirects = [...netlifyRedirects().matchAll(/^\/api\/([a-z-]+)\s+\/\.netlify\/functions\/\1\s+200$/gm)].map((m) => m[1]);
    expect(fromRedirects.sort()).toEqual([...API_FUNCTIONS].sort());
  });
});
