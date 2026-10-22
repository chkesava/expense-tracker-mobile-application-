/**
 * SPENDLY-519 — scans a built bundle for server secrets.
 *
 *   npx expo export --platform web --output-dir dist-web
 *   npx tsx scripts/scan-bundle-secrets.ts dist-web
 *
 * Exits 1 and lists each finding (redacted) if anything matches; see
 * scripts/lib/bundleSecretScan.ts for what counts. Text files only
 * (.js/.html/.json/.map/.css/.txt); images and fonts are skipped.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { scanForSecrets } from "./lib/bundleSecretScan";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(js|mjs|cjs|html|json|map|css|txt|hbc)$/.test(name) ? [full] : [];
  });
}

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error("usage: npx tsx scripts/scan-bundle-secrets.ts <bundle dir>");
  process.exit(2);
}
const files = walk(dir).map((file) => ({ name: path.relative(dir, file), content: readFileSync(file, "latin1") }));
const findings = scanForSecrets(files);
console.log(`scanned ${files.length} files in ${dir}`);
if (findings.length) {
  for (const f of findings) console.log(`LEAK ${f.kind}: ${f.file} (${f.sample})`);
  process.exit(1);
}
console.log("no server secrets found");
