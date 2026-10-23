import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Only the functions listed in scripts/bundle-netlify-fns.js are deployed:
 * web-deploy ships the pre-bundled `netlify/functions-dist`, never the raw
 * sources. SPENDLY-505's `readmodel-claims` and SPENDLY-583's
 * `readmodel-push` were missed for that reason and 404'd in production
 * (found 2026-10-23). Every entrypoint must be listed, bundled by the deploy,
 * and load-checked by it.
 */
const root = path.resolve(__dirname, "..");
const { FUNCTIONS } = createRequire(__filename)(path.join(root, "scripts", "bundle-netlify-fns.js")) as { FUNCTIONS: string[] };

const entrypoints = readdirSync(path.join(root, "netlify", "functions"))
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_") && !f.endsWith(".test.ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

describe("Netlify functions are deployed", () => {
  it("every function entrypoint is in the bundle list", () => {
    expect([...FUNCTIONS].sort()).toEqual(entrypoints);
  });

  it("web-deploy load-checks every bundled function before deploying", () => {
    const workflow = readFileSync(path.join(root, ".github", "workflows", "web-deploy.yml"), "utf8");
    for (const name of FUNCTIONS) {
      expect(workflow).toContain(`require('./netlify/functions-dist/${name}.js')`);
    }
  });
});
