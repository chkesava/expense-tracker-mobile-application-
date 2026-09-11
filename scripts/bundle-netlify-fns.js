/**
 * Bundle the Netlify functions so `@/` imports and firebase-admin resolve
 * without turning on Firebase Cloud Functions.
 *
 * Generalised from the original single-function script (KAN-36) when KAN-67
 * added a second function. Every function shares the same two constraints, so
 * they share one bundler:
 *
 *   - `@/` is a tsconfig-only path alias, which esbuild needs told about.
 *   - firebase-admin@14 → jwks-rsa@4 → jose@6, and jose 6 is ESM-only while
 *     jwks-rsa still `require()`s it. That crashes Netlify's CJS runtime with
 *     ERR_REQUIRE_ESM *before the handler runs*, so the generated package.json
 *     pins a dual CJS/ESM jose.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "netlify", "functions-dist");

/** Every function deployed to Netlify. Add new entrypoints here. */
const FUNCTIONS = ["ganesh-summary", "epf-cron"];

fs.mkdirSync(outDir, { recursive: true });

for (const name of FUNCTIONS) {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild",
      `netlify/functions/${name}.ts`,
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node22",
      `--outfile=${path.join("netlify", "functions-dist", `${name}.js`)}`,
      `--alias:@=${root}`,
      "--external:firebase-admin",
    ],
    { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// See the header: without this override the functions die on load, not on call.
const JOSE_CJS = "4.15.9";

fs.writeFileSync(
  path.join(outDir, "package.json"),
  `${JSON.stringify(
    {
      name: "spendly-netlify-fns",
      private: true,
      dependencies: { "firebase-admin": "14.2.0" },
      overrides: { jose: JOSE_CJS, "jwks-rsa": { jose: JOSE_CJS } },
    },
    null,
    2
  )}\n`
);
