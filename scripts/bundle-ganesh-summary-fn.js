/**
 * Bundle the Ganesh summary Netlify function so `@/` imports and firebase-admin
 * resolve without turning on Firebase Cloud Functions.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "netlify", "functions-dist");
fs.mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  "npx",
  [
    "--yes",
    "esbuild",
    "netlify/functions/ganesh-summary.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node22",
    `--outfile=${path.join("netlify", "functions-dist", "ganesh-summary.js")}`,
    `--alias:@=${root}`,
    "--external:firebase-admin",
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

fs.writeFileSync(
  path.join(outDir, "package.json"),
  `${JSON.stringify(
    {
      name: "ganesh-summary-fn",
      private: true,
      dependencies: { "firebase-admin": "14.2.0" },
    },
    null,
    2
  )}\n`
);
