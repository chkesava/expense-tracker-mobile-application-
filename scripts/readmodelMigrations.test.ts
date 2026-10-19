import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-504 — static guards on the read-model migrations, run with every
 * `npm test` (the full apply + assertions run in readmodel-schema.yml).
 */
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase-readmodel", "supabase", "migrations");

const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const sql = migrations.map((file) => readFileSync(path.join(migrationsDir, file), "utf8")).join("\n");

function createdTables(source: string): string[] {
  return [...source.matchAll(/create table public\.([a-z_]+)/gi)].map((m) => m[1]);
}

function rlsLoopTables(source: string): string[] {
  const loop = source.match(/foreach t in array array\[([\s\S]*?)\]/i);
  if (!loop) return [];
  return [...loop[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const WAVE_1 = [
  "expenses",
  "incomes",
  "ledger_events",
  "accounts",
  "account_types",
  "account_transfers",
  "account_entries",
  "account_payments",
  "credit_card_bills",
  "categories",
];

describe("read-model migrations (SPENDLY-504)", () => {
  it("names migrations with a sortable timestamp prefix", () => {
    expect(migrations.length).toBeGreaterThan(0);
    for (const file of migrations) expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("creates every Wave 1 table", () => {
    expect(createdTables(sql)).toEqual(expect.arrayContaining(WAVE_1));
  });

  it("enables RLS and revokes client grants on every table it creates", () => {
    const covered = new Set(rlsLoopTables(sql));
    const uncovered = createdTables(sql).filter((table) => !covered.has(table));
    expect(uncovered).toEqual([]);
  });

  it("stops default grants to client roles for future tables", () => {
    expect(sql).toMatch(/alter default privileges in schema public revoke all on tables\s+from anon, authenticated/i);
  });

  it("creates no policies (read policies belong to SPENDLY-505)", () => {
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(/create policy/i);
  });

  it("never uses floating point for any column", () => {
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/\b(real|double precision|float[48]?)\b/i);
  });

  it("is not wired into the Ganesh Seva supabase/ project", () => {
    const ganeshConfig = path.join(root, "supabase", "config.toml");
    const readModelConfig = readFileSync(
      path.join(root, "supabase-readmodel", "supabase", "config.toml"),
      "utf8"
    );
    expect(readModelConfig).toMatch(/^project_id = "spendly-read-model"$/m);
    expect(() => readFileSync(ganeshConfig, "utf8")).toThrow();
  });
});
