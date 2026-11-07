import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** SPENDLY-705: the Cloudflare backup's pre-deploy secret check (scripts/check-backup-secrets.js). */
const root = path.resolve(__dirname, "..");
const { findLeaks } = createRequire(__filename)(path.join(root, "scripts", "check-backup-secrets.js")) as {
  findLeaks(files: { name: string; content: string }[], env: Record<string, string | undefined>): { file: string; kind: string }[];
};

// The line in jose (bundled into _worker.js) that stopped the first backup run, 42341897313.
const JOSE_LINE = 'if (typeof pkcs8 !== "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) {';
const KEY_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj";
const ACCOUNT = JSON.stringify({
  type: "service_account",
  private_key_id: "0123456789abcdef0123456789abcdef01234567",
  private_key: `-----BEGIN PRIVATE KEY-----\n${KEY_BODY}\n-----END PRIVATE KEY-----\n`,
});
const ENV = { GEMINI_API_KEY: "AIzaSyFakeGeminiKeyForTests000000", FIREBASE_SERVICE_ACCOUNT: ACCOUNT };

describe("check-backup-secrets", () => {
  it("passes the Worker's key-handling library code (the first run's false positive)", () => {
    expect(findLeaks([{ name: "_worker.js", content: `function importPKCS8(pkcs8) { ${JOSE_LINE} }` }], ENV)).toEqual([]);
  });

  it("passes a clean build", () => {
    expect(findLeaks([{ name: "expense/_expo/static/js/web/entry.js", content: "console.log('app')" }, { name: "index.html", content: "<html/>" }], ENV)).toEqual([]);
  });

  it("stops an actual private key, even inside the Worker", () => {
    const inlined = `const key = "-----BEGIN PRIVATE KEY-----\\n${KEY_BODY}\\n-----END PRIVATE KEY-----";`;
    expect(findLeaks([{ name: "_worker.js", content: inlined }], {})).toEqual([{ file: "_worker.js", kind: "a private key" }]);
    const multiline = `-----BEGIN RSA PRIVATE KEY-----\n${KEY_BODY}\n`;
    expect(findLeaks([{ name: "assets/x.txt", content: multiline }], {})).toEqual([{ file: "assets/x.txt", kind: "a private key" }]);
  });

  it("stops even a private-key header in a file browsers get", () => {
    expect(findLeaks([{ name: "expense/_expo/static/js/web/entry.js", content: JOSE_LINE }], {})).toEqual([
      { file: "expense/_expo/static/js/web/entry.js", kind: "a private-key header in a browser file" },
    ]);
  });

  it("stops the Gemini key and the service account anywhere, the Worker included", () => {
    const leaks = findLeaks(
      [
        { name: "_worker.js", content: `const k = "${ENV.GEMINI_API_KEY}";` },
        { name: "index.html", content: `<meta id="0123456789abcdef0123456789abcdef01234567">` },
        { name: "ganesh/_expo/x.js", content: `"${KEY_BODY.slice(0, 40)}"` },
      ],
      ENV
    );
    expect(leaks).toEqual([
      { file: "_worker.js", kind: "GEMINI_API_KEY" },
      { file: "index.html", kind: "FIREBASE_SERVICE_ACCOUNT (private_key_id)" },
      { file: "ganesh/_expo/x.js", kind: "FIREBASE_SERVICE_ACCOUNT (private_key)" },
    ]);
  });

  it("stops the CoinGecko key anywhere (SPENDLY-714)", () => {
    const env = { COINGECKO_API_KEY: "CG-FakeDemoKeyForTests0000" };
    expect(findLeaks([{ name: "expense/_expo/x.js", content: `"${env.COINGECKO_API_KEY}"` }], env)).toEqual([
      { file: "expense/_expo/x.js", kind: "COINGECKO_API_KEY" },
    ]);
  });

  it("never reports the secret itself", () => {
    const leaks = findLeaks([{ name: "_worker.js", content: ENV.GEMINI_API_KEY! }], ENV);
    expect(JSON.stringify(leaks)).not.toContain(ENV.GEMINI_API_KEY);
  });

  it("ignores missing or unusable secret settings", () => {
    expect(findLeaks([{ name: "index.html", content: "x" }], { GEMINI_API_KEY: "", FIREBASE_SERVICE_ACCOUNT: "not json" })).toEqual([]);
  });
});
