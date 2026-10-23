import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { forgedFirebaseToken, leakedNothing } from "./readmodel-identity-check";

describe("readmodel-identity-check (SPENDLY-505)", () => {
  it("forges a token that looks like a Firebase ID token for this project", () => {
    const [header, payload, signature] = forgedFirebaseToken("victim", 1_000).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({ alg: "RS256" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
      iss: "https://securetoken.google.com/expenseapp-27f94",
      aud: "expenseapp-27f94",
      sub: "victim",
      role: "authenticated",
      exp: 4_600,
    });
    expect(signature.length).toBeGreaterThan(100);
  });

  it("counts a refusal or an empty list as no leak, and any row as a leak", () => {
    expect(leakedNothing({ status: 401, rows: null, foreignRows: 0 })).toBe(true);
    expect(leakedNothing({ status: 200, rows: 0, foreignRows: 0 })).toBe(true);
    expect(leakedNothing({ status: 200, rows: 1, foreignRows: 1 })).toBe(false);
  });

  it("only ever reads (GET with the publishable key)", () => {
    const source = readFileSync(path.join(__dirname, "readmodel-identity-check.ts"), "utf8");
    expect(source).not.toMatch(/method:\s*["'](POST|PATCH|PUT|DELETE)/);
    expect(source).not.toMatch(/SERVICE_ROLE_KEY/);
  });
});
