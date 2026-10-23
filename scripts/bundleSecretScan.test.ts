import { describe, expect, it } from "vitest";

import { scanForSecrets } from "./lib/bundleSecretScan";

/** SPENDLY-519 — the bundle secret scan finds every leak shape, and nothing in a clean bundle. */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: object) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.c2lnbmF0dXJlc2lnbmF0dXJl`;

describe("bundle secret scan (SPENDLY-519)", () => {
  it("passes a clean bundle holding only publishable values", () => {
    const clean = `const url="https://x.supabase.co";const key="sb_publishable_abc123";` +
      `process.env.EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY;const anon="${jwt({ role: "anon", iss: "supabase" })}";`;
    expect(scanForSecrets([{ name: "app.js", content: clean }])).toEqual([]);
  });

  it("finds a Supabase secret key, a service_role JWT, a PEM key and a service-account JSON", () => {
    const leaky = `a="sb_secret_abcdef123456";b="${jwt({ role: "service_role", iss: "supabase" })}";` +
      `c="-----BEGIN PRIVATE KEY-----\\nMII";d={"type":"service_account","private_key":"x"}`;
    expect(scanForSecrets([{ name: "app.js", content: leaky }]).map((f) => f.kind).sort()).toEqual([
      "PEM private key", "service-account JSON", "service_role JWT", "supabase secret key",
    ]);
  });

  it("finds a bundled server env name, but not its EXPO_PUBLIC_ cousins", () => {
    expect(scanForSecrets([{ name: "a.js", content: "process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY" }])).toHaveLength(1);
    expect(scanForSecrets([{ name: "a.js", content: "process.env.EXPO_PUBLIC_READMODEL_SUPABASE_URL" }])).toEqual([]);
  });

  it("never echoes a whole secret in its report", () => {
    const [finding] = scanForSecrets([{ name: "a.js", content: "sb_secret_0123456789abcdefghij" }]);
    expect(finding.sample.length).toBeLessThan(15);
  });
});
