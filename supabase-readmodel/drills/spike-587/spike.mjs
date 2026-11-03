// SPENDLY-587 spike: rm_client_apply + realtime ping under Firebase-shaped tokens.
// Local Docker Supabase only. Tokens are HS256-signed with the local JWT secret
// but carry exactly the claims a Firebase ID token carries after readmodel-claims.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

const URL = process.env.SB_URL;
const ANON = process.env.SB_ANON;
const SECRET = process.env.SB_JWT_SECRET;
const PROJECT = "expenseapp-27f94";
const now = () => Math.floor(Date.now() / 1000);

function token(sub, { expired = false, iss = `https://securetoken.google.com/${PROJECT}`, aud = PROJECT } = {}) {
  return jwt.sign({ sub, iss, aud, role: "authenticated", iat: now() - 60, exp: expired ? now() - 10 : now() + 3600 }, SECRET, {
    algorithm: "HS256",
  });
}
function client(tok) {
  return createClient(URL, ANON, {
    accessToken: async () => tok,
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 50 } },
  });
}
const row = (uid, id, amount, writtenAt = new Date().toISOString()) => ({
  uid, doc_id: id, amount, date: "2026-11-03", month: "2026-11", category: "Food",
  doc: { amount, category: "Food", date: "2026-11-03" }, client_written_at: writtenAt,
});
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = "spikeUserA", B = "spikeUserB";
const a = client(token(A)), b = client(token(B));

// ── Write path ──────────────────────────────────────────────────────────────
let r = await a.rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(A, "e1", 100)] });
check("A writes its own row", !r.error && r.data?.upserted === 1, r.error?.message);

r = await a.rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(B, "x1", 1)] });
check("A cannot write a row for B", !!r.error, r.error?.message);

r = await client(token(`${A}_duress`)).rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(`${A}_duress`, "d1", 1)] });
check("a duress token cannot write", !!r.error, r.error?.message);

r = await client(token(A, { expired: true })).rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(A, "e9", 1)] });
check("an expired token cannot write", !!r.error, r.error?.message ?? r.error?.code);

r = await client(token(A, { iss: "https://evil.example" })).rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(A, "e8", 1)] });
check("a token from another issuer cannot write", !!r.error, r.error?.message);

r = await a.rpc("rm_client_apply", { p_table: "accounts", p_rows: [] });
check("a non-allowlisted table is refused", !!r.error, r.error?.message);

r = await a.from("expenses").insert({ ...row(A, "direct", 5), source_path: "x", source_update_time: new Date().toISOString() });
check("direct table insert is refused (SELECT-only)", !!r.error, r.error?.message);

const older = new Date(Date.now() - 60_000).toISOString();
r = await a.rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(A, "e1", 999, older)] });
let got = await a.from("expenses").select("amount").eq("doc_id", "e1").single();
check("version guard: an older client write never overwrites a newer one", Number(got.data?.amount) === 100, `amount=${got.data?.amount}`);

r = await a.rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(A, "e1", 150)] });
got = await a.from("expenses").select("amount").eq("doc_id", "e1").single();
check("a newer client write lands", Number(got.data?.amount) === 150, `amount=${got.data?.amount}`);

got = await b.from("expenses").select("doc_id").eq("doc_id", "e1");
check("B cannot read A's row (RLS)", (got.data ?? []).length === 0);

// ── Realtime ────────────────────────────────────────────────────────────────
async function subscribe(c, topic) {
  await c.realtime.setAuth();
  const seen = [];
  const ch = c.channel(topic, { config: { private: true } });
  const status = await new Promise((resolve) => {
    ch.on("broadcast", { event: "changed" }, (m) => seen.push(m.payload)).subscribe((s, err) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") resolve(err ? `${s}: ${err.message}` : s);
    });
    setTimeout(() => resolve("NO_STATUS"), 8000);
  });
  return { ch, seen, status };
}

const subA = await subscribe(a, `user:${A}`);
check("A subscribes to its own private topic", subA.status === "SUBSCRIBED", subA.status);
const subBonA = await subscribe(b, `user:${A}`);
const subDuress = await subscribe(client(token(`${A}_duress`)), `user:${A}_duress`);

const t0 = Date.now();
await a.rpc("rm_client_apply", { p_table: "expenses", p_rows: [row(A, "e2", 42)] });
await a.rpc("rm_client_apply", { p_table: "expenses", p_deletes: [{ uid: A, doc_id: "e1", client_written_at: new Date().toISOString() }] });
await sleep(4000);
const pingE2 = subA.seen.find((p) => p.doc_id === "e2");
check("A receives a ping for its new row", !!pingE2, pingE2 ? `${pingE2.ping_ms ?? ""}` : "none");
check("the ping carries no document data", !!pingE2 && !("doc" in pingE2) && !("amount" in pingE2), JSON.stringify(pingE2 ?? {}));
const pingDel = subA.seen.find((p) => p.doc_id === "e1" && p.deleted === true);
check("A receives a ping for a soft delete", !!pingDel);
got = await a.from("expenses").select("doc_id").eq("doc_id", "e1");
check("the soft-deleted row is gone from A's reads after the refetch", (got.data ?? []).length === 0);
check("B never receives A's pings", subBonA.seen.length === 0, `B status=${subBonA.status}, got ${subBonA.seen.length}`);
check("a duress token gets no pings", subDuress.seen.length === 0, `status=${subDuress.status}`);

// A server-side write (sync/push) also pings, and wins over a client row.
console.log(`ping latency budget check: ${Date.now() - t0} ms for 2 writes + 4 s wait`);

for (const s of [subA, subBonA, subDuress]) await s.ch.unsubscribe().catch(() => {});
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
