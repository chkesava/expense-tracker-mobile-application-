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

/**
 * Tables named by any `foreach … loop` whose body enables RLS. Later
 * migrations (e.g. SPENDLY-609 goals) add their own loop, so every such loop
 * counts, not just the first one in the file.
 */
function rlsLoopTables(source: string): string[] {
  const loops = [...source.matchAll(/foreach t in array array\[([\s\S]*?)\] loop([\s\S]*?)end loop/gi)];
  return loops
    .filter((m) => /enable row level security/i.test(m[2]))
    .flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((t) => t[1]));
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

  it("creates the Save Goals tables (SPENDLY-609)", () => {
    expect(createdTables(sql)).toEqual(expect.arrayContaining(["financial_goals", "goal_events"]));
  });

  it("stops default grants to client roles for future tables", () => {
    expect(sql).toMatch(/alter default privileges in schema public revoke all on tables\s+from anon, authenticated/i);
  });

  it("creates only owner-read SELECT policies for authenticated (SPENDLY-505)", () => {
    const code = sql.replace(/--.*$/gm, "");
    const policies = [...code.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/for select to authenticated/i);
      expect(policy).toMatch(/readmodel_auth\.uid\(\)/);
    }
  });

  it("never grants writes to client roles, or anything to anon (SPENDLY-505)", () => {
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/grant\s+[^;]*\b(insert|update|delete|truncate|all)\b[^;]*\bto\s+[^;]*\b(anon|authenticated)\b/i);
    expect(code).not.toMatch(/grant\s+[^;]*\bto\s+[^;]*\banon\b/i);
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
