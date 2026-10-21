/**
 * SPENDLY-505 — live, read-only check of the read-model identity path against
 * the real Supabase project. It proves what only the Supabase gateway can
 * prove (JWT signature checks); the RLS layer is proven offline by
 * supabase-readmodel/tests/rls_behaviour.sql.
 *
 * Every probe is a GET on PostgREST with the publishable key. Nothing is
 * written anywhere.
 *
 *   READMODEL_SUPABASE_URL=https://<ref>.supabase.co \
 *   READMODEL_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   [READMODEL_CHECK_ID_TOKEN=<a real Firebase ID token with role=authenticated>] \
 *   npx tsx scripts/readmodel-identity-check.ts
 *
 * Expected:
 * - no token          → no rows (anon has no grants: 401/403, or an empty list)
 * - forged token      → 401 (signature not from Firebase's keys)
 * - malformed token   → 401
 * - real token, if given → 200, and every row's uid is the token's sub
 */
import { generateKeyPairSync, createSign } from "node:crypto";

const TABLES = [
  "expenses", "incomes", "ledger_events", "accounts", "account_types",
  "account_transfers", "account_entries", "account_payments",
  "credit_card_bills", "categories", "sync_status",
];
const PROJECT = "expenseapp-27f94";

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** A token shaped exactly like a Firebase ID token, signed by a key Firebase never used. */
export function forgedFirebaseToken(sub: string, now = Math.floor(Date.now() / 1000)): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "forged-key", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      sub,
      user_id: sub,
      role: "authenticated",
      iat: now,
      auth_time: now,
      exp: now + 3600,
      firebase: { sign_in_provider: "password", identities: {} },
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(privateKey))}`;
}

export type ProbeOutcome = { status: number; rows: number | null; foreignRows: number };

async function probe(base: string, key: string, table: string, token: string | null, ownUid?: string): Promise<ProbeOutcome> {
  const headers: Record<string, string> = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/rest/v1/${table}?select=uid&limit=1000`, { headers });
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body) ? body : null;
  return {
    status: res.status,
    rows: rows?.length ?? null,
    foreignRows: rows && ownUid ? rows.filter((r: { uid?: string }) => r.uid !== ownUid).length : rows?.length ?? 0,
  };
}

/** True when a probe leaked nothing: refused, or an empty result. */
export const leakedNothing = (o: ProbeOutcome) => o.status >= 400 || o.rows === 0;

async function main() {
  const base = (process.env.READMODEL_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.READMODEL_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!base || !key) throw new Error("Set READMODEL_SUPABASE_URL and READMODEL_SUPABASE_PUBLISHABLE_KEY.");
  if (/sb_secret_|service_role/.test(key)) throw new Error("Use the publishable key, never a secret key.");

  const cases: { name: string; token: string | null; expect: (o: ProbeOutcome) => boolean; ownUid?: string }[] = [
    { name: "no token", token: null, expect: leakedNothing },
    { name: "forged token", token: forgedFirebaseToken("victim-uid"), expect: (o) => o.status === 401 },
    { name: "malformed token", token: "not.a.jwt", expect: (o) => o.status === 401 },
  ];
  const real = process.env.READMODEL_CHECK_ID_TOKEN;
  if (real) {
    const sub = JSON.parse(Buffer.from(real.split(".")[1] ?? "", "base64url").toString("utf8")).sub as string;
    cases.push({ name: "real token (own rows only)", token: real, ownUid: sub, expect: (o) => o.status === 200 && o.foreignRows === 0 });
  }

  let failed = 0;
  for (const c of cases) {
    for (const table of TABLES) {
      const outcome = await probe(base, key, table, c.token, c.ownUid);
      const ok = c.expect(outcome);
      if (!ok) failed += 1;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(28)} ${table.padEnd(18)} status=${outcome.status} rows=${outcome.rows ?? "-"}`);
    }
  }
  if (!real) console.log("\n(real-token case skipped: set READMODEL_CHECK_ID_TOKEN to run it)");
  console.log(failed ? `\n${failed} probe(s) FAILED` : "\nAll probes passed.");
  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
