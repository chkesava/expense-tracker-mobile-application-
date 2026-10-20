import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-499 — `financialSummaries/netWorth` and `/investments` are retired
 * (no reader; `composeNetWorth` is the single net-worth definition). This
 * keeps any app or script code from writing or reading them again.
 */
const root = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "hooks", "lib", "providers", "services", "shared", "features", "scripts", "netlify"];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules") return [];
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const RETIRED = [
  /financialSummaries\/(netWorth|investments)\b/,
  /"financialSummaries",\s*"(netWorth|investments)"/,
  /\bbuildNetWorthOps\b/,
  /\bbuildInvestmentSummaryOps\b/,
];

describe("retired summary docs (SPENDLY-499)", () => {
  it("no code touches financialSummaries/netWorth or /investments", () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(path.join(root, dir))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (line.trim().startsWith("*") || line.trim().startsWith("//")) return;
          if (RETIRED.some((re) => re.test(line))) hits.push(`${path.relative(root, file)}:${i + 1}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
