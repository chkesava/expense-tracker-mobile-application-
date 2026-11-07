import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BACKUP_FUNCTIONS, NETLIFY_ONLY_FUNCTIONS } from "../cloudflare/functions";
import type { NetlifyEvent, NetlifyResult } from "../cloudflare/netlifyAdapter";
import { createWorker, type Env } from "../cloudflare/router";

/**
 * SPENDLY-705: the smoke test (scripts/smoke-web-backup.js) and the manual
 * Cloudflare backup workflow.
 */
const root = path.resolve(__dirname, "..");
const req = createRequire(__filename);
const smoke = req(path.join(root, "scripts", "smoke-web-backup.js")) as {
  smokeChecks(mode: string): { name: string; path: string }[];
  runSmoke(
    origin: string,
    opts: { mode: string; fetchImpl: typeof fetch; log: (line: string) => void; wait: { attempts: number; delayMs: number } }
  ): Promise<{ failures: number; warnings: number }>;
  MARKET_PROBES: Record<string, string>;
  SIGNED_IN_FUNCTIONS: string[];
  NETLIFY_ONLY_POST: string[];
  NETLIFY_ONLY_GET: string[];
};
const { WRANGLER } = req(path.join(root, "scripts", "build-cloudflare-worker.js")) as { WRANGLER: string };

const ORIGIN = "https://backup.example";
const SECURITY = {
  "Content-Security-Policy": "default-src 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Robots-Tag": "noindex, nofollow",
};

/** A healthy backup: the real router over fake static files and fake handlers. */
function backupSite(overrides: Record<string, (event: NetlifyEvent) => Promise<NetlifyResult>> = {}) {
  const files = new Map<string, { body: string; type: string; immutable?: boolean }>();
  for (const base of ["", "/expense", "/nutrition", "/ganesh"]) {
    files.set(`${base}/`, { body: `<html><script src="${base}/_expo/static/js/web/entry-abc.js"></script></html>`, type: "text/html" });
    files.set(`${base}/manifest.webmanifest`, { body: JSON.stringify({ start_url: `${base}/` }), type: "application/manifest+json" });
    files.set(`${base}/pwa-192.png`, { body: "png", type: "image/png" });
    files.set(`${base}/_expo/static/js/web/entry-abc.js`, { body: "js", type: "application/javascript", immutable: true });
  }
  const env: Env = {
    ASSETS: {
      fetch: async (request: Request) => {
        const file = files.get(new URL(request.url).pathname);
        if (!file) return new Response("<html>404</html>", { status: 404, headers: { "Content-Type": "text/html", ...SECURITY } });
        return new Response(file.body, {
          headers: { "Content-Type": file.type, ...SECURITY, ...(file.immutable ? { "Cache-Control": "public, max-age=31536000, immutable" } : {}) },
        });
      },
    },
  };
  const json = (statusCode: number, body: unknown): NetlifyResult => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const signedIn = async (event: NetlifyEvent) =>
    event.httpMethod === "OPTIONS" ? { statusCode: 204, headers: {}, body: "" } : json(401, { error: "Sign in first." });
  const handlers: Record<string, (event: NetlifyEvent) => Promise<NetlifyResult>> = {
    ...Object.fromEntries(Object.keys(smoke.MARKET_PROBES).map((name) => [name, async () => json(200, { success: true })])),
    "nutrition-ai": signedIn,
    "readmodel-claims": signedIn,
    ...overrides,
  };
  const worker = createWorker({
    loaders: Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async () => ({ handler })])),
    netlifyOnly: NETLIFY_ONLY_FUNCTIONS,
    cache: () => null,
    now: () => 0,
  });
  const ctx = { waitUntil: () => undefined };
  return (async (input: string | URL | Request, init?: RequestInit) =>
    worker.fetch(new Request(String(input), init), env, ctx)) as typeof fetch;
}

async function run(fetchImpl: typeof fetch, mode = "backup") {
  const lines: string[] = [];
  const result = await smoke.runSmoke(ORIGIN, { mode, fetchImpl, log: (l) => lines.push(l), wait: { attempts: 1, delayMs: 0 } });
  return { ...result, lines };
}

describe("smoke test", () => {
  it("passes a healthy backup", async () => {
    const { failures, warnings, lines } = await run(backupSite());
    expect(lines.filter((l) => l.startsWith("FAIL"))).toEqual([]);
    expect(failures).toBe(0);
    expect(warnings).toBe(0);
  });

  it("fails when an API answers with the app's HTML", async () => {
    const site = backupSite();
    const broken = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/api/stock?")) return new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
      return site(input, init);
    }) as typeof fetch;
    const { failures, lines } = await run(broken);
    expect(failures).toBe(1);
    expect(lines.find((l) => l.startsWith("FAIL"))).toContain("/api/stock");
  });

  it("only warns when market data upstream is down", async () => {
    const { failures, warnings } = await run(
      backupSite({ stock: async () => ({ statusCode: 502, headers: { "Content-Type": "application/json" }, body: '{"success":false}' }) })
    );
    expect(failures).toBe(0);
    expect(warnings).toBe(1);
  });

  it("fails when a signed-in function accepts a request without credentials", async () => {
    const { failures, lines } = await run(
      backupSite({
        "readmodel-claims": async (event) =>
          event.httpMethod === "OPTIONS"
            ? { statusCode: 204, headers: {}, body: "" }
            : { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "{}" },
      })
    );
    expect(failures).toBe(1);
    expect(lines.find((l) => l.startsWith("FAIL"))).toContain("readmodel-claims without sign-in");
  });

  it("fails when the site never comes up", async () => {
    const down = (async () => new Response("", { status: 522 })) as typeof fetch;
    expect((await run(down)).failures).toBe(1);
  });

  it("in Netlify mode skips the checks only the backup can pass", () => {
    const names = (mode: string) => smoke.smokeChecks(mode).map((c) => c.name);
    expect(names("backup")).toContain("unknown API path");
    expect(names("netlify")).not.toContain("unknown API path");
    expect(names("netlify")).not.toContain("missing bundle file");
  });

  it("covers every function exactly as the backup classifies it", () => {
    expect([...Object.keys(smoke.MARKET_PROBES), ...smoke.SIGNED_IN_FUNCTIONS].sort()).toEqual(Object.keys(BACKUP_FUNCTIONS).sort());
    expect([...smoke.NETLIFY_ONLY_POST, ...smoke.NETLIFY_ONLY_GET].sort()).toEqual(Object.keys(NETLIFY_ONLY_FUNCTIONS).sort());
  });

  it("never sends credentials", () => {
    const source = readFileSync(path.join(root, "scripts", "smoke-web-backup.js"), "utf8");
    expect(source).not.toMatch(/Authorization|Bearer|x-epf-cron-secret/i);
  });
});

describe("the backup workflow", () => {
  const workflow = readFileSync(path.join(root, ".github", "workflows", "web-deploy-cloudflare-backup.yml"), "utf8");
  const commands = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const triggers = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\nconcurrency:"));

  it("runs only when started by hand", () => {
    expect(triggers).toContain("workflow_dispatch");
    for (const trigger of ["push", "pull_request", "schedule", "workflow_run", "release"]) {
      expect(triggers).not.toMatch(new RegExp(`^\\s+${trigger}:`, "m"));
    }
  });

  it("never uses Netlify credentials or deploys to Netlify", () => {
    expect(commands).not.toMatch(/NETLIFY_AUTH_TOKEN|NETLIFY_SITE_ID|netlify deploy|netlify-cli/);
  });

  it("builds with the backup's own origin and checks it reached the app", () => {
    expect(workflow).toContain("CLOUDFLARE_BACKUP_ORIGIN: ${{ vars.CLOUDFLARE_BACKUP_ORIGIN }}");
    expect(workflow).toContain(`sed -i '/^EXPO_PUBLIC_SHARE_URL=/d' .env`);
    expect(workflow).toContain('EXPO_PUBLIC_SHARE_URL=%s');
    expect(workflow).toContain("The backup origin is not in the built app");
  });

  it("runs the same gate as the Netlify deploy", () => {
    for (const step of ["uses: ./.github/workflows/rules-tests.yml", "npm ci", "npm test", "npm run typecheck:shared", "npm run typecheck", "npm run build:web:all"]) {
      expect(workflow).toContain(step);
    }
  });

  it("builds the Pages output and the Worker, checks for leaked secrets, deploys, then smoke tests", () => {
    const order = [
      "npm run build:cloudflare-pages",
      "npm run build:cloudflare-worker",
      "Check no server secret reached the bundle",
      "pages deploy",
      "node scripts/smoke-web-backup.js \"$CLOUDFLARE_BACKUP_ORIGIN\" --mode=backup",
    ].map((step) => workflow.indexOf(step));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("checks the token can reach the Pages project before building", () => {
    const access = commands.indexOf("/pages/projects/$CLOUDFLARE_PAGES_PROJECT");
    expect(access).toBeGreaterThan(0);
    expect(access).toBeLessThan(commands.indexOf("npm ci"));
  });

  it("falls back to the older Gemini secret name, like the Netlify deploy", () => {
    const fallback = "GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY || secrets.EXPO_PUBLIC_GEMINI_API_KEY }}";
    expect(commands.split(fallback).length - 1).toBe(2);
    expect(commands).not.toContain("GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}");
  });

  it("passes the CoinGecko key to the Pages secrets and the leak check (SPENDLY-714)", () => {
    expect(commands.split("COINGECKO_API_KEY: ${{ secrets.COINGECKO_API_KEY }}").length - 1).toBe(2);
    expect(commands).toContain("pages secret put COINGECKO_API_KEY");
  });

  it("checks for leaked secrets with the tested scanner, not ad-hoc greps", () => {
    expect(commands).toContain("run: node scripts/check-backup-secrets.js dist-cloudflare");
    expect(commands).not.toMatch(/grep -rqE "BEGIN/);
  });

  it("lets Pages re-bundle the Worker", () => {
    expect(commands).not.toContain("--no-bundle");
  });

  it("pins the same wrangler as the Worker build", () => {
    expect(workflow).toContain(`WRANGLER: ${WRANGLER}`);
  });

  it("never leaves Gemini in the client env", () => {
    expect(workflow).toContain(`sed -i '/^EXPO_PUBLIC_GEMINI_API_KEY=/d' .env`);
  });
});
