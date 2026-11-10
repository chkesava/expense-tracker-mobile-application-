import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * SPENDLY-702: one routing table for both hosts (scripts/lib/webHosting.js).
 * Netlify stays primary, so its _redirects and _headers are pinned byte for
 * byte to what scripts/build-web.js wrote before the table was shared.
 */
const root = path.resolve(__dirname, "..");
const req = createRequire(__filename);
const hosting = req(path.join(root, "scripts", "lib", "webHosting.js")) as {
  PRODUCT_BASE_PATHS: string[];
  CSP: string;
  netlifyRedirects(): string;
  netlifyHeaders(): string;
  cloudflareHeaders(): string;
  cloudflareRoutes(): { version: number; include: string[]; exclude: string[] };
  spaIndexFor(pathname: string): string | null;
};
const { buildCloudflarePages, VENDOR_ASSETS_DIR, assertNoIgnoredNodeModules } = req(path.join(root, "scripts", "build-cloudflare-pages.js")) as {
  buildCloudflarePages(from: string, to: string, limits?: { maxFiles: number; maxFileBytes: number }): void;
  VENDOR_ASSETS_DIR: string;
  assertNoIgnoredNodeModules(dir: string): void;
};

const NETLIFY_REDIRECTS_BEFORE = [
  "/expense           /expense/index.html     200",
  "/expense/*         /expense/index.html     200",
  "/nutrition         /nutrition/index.html   200",
  "/nutrition/*       /nutrition/index.html   200",
  "/ganesh            /ganesh/index.html      200",
  "/ganesh/*          /ganesh/index.html      200",
  "/split/*           /index.html             200",
  "/payment/*         /index.html             200",
  "/api/stock         /.netlify/functions/stock         200",
  "/api/mutual-funds  /.netlify/functions/mutual-funds  200",
  "/api/crypto        /.netlify/functions/crypto        200",
  "/api/stock-history /.netlify/functions/stock-history 200",
  "/api/market-overview /.netlify/functions/market-overview 200",
  "/api/screener-universe /.netlify/functions/screener-universe 200",
  "/api/stock-quotes /.netlify/functions/stock-quotes 200",
  "/*                 /index.html             200",
  "",
].join("\n");

const NETLIFY_HEADERS_BEFORE = [
  "/_expo/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/*/_expo/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/*/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/*",
  "  X-Frame-Options: DENY",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  X-Content-Type-Options: nosniff",
  "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
  "  X-Robots-Tag: noindex, nofollow",
  "  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com https://www.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.google.com https://*.supabase.co wss://*.supabase.co; frame-src https://accounts.google.com https://*.firebaseapp.com https://*.google.com; form-action 'self' https://accounts.google.com",
  "",
].join("\n");

describe("Netlify output is unchanged", () => {
  it("_redirects is byte-identical", () => {
    expect(hosting.netlifyRedirects()).toBe(NETLIFY_REDIRECTS_BEFORE);
  });

  it("_headers is byte-identical", () => {
    expect(hosting.netlifyHeaders()).toBe(NETLIFY_HEADERS_BEFORE);
  });
});

describe("Cloudflare _headers", () => {
  const text = hosting.cloudflareHeaders();
  const rules = text.split("\n").filter((line) => line.startsWith("/"));

  it("has at most one wildcard per rule, which Pages requires", () => {
    for (const rule of rules) expect(rule.split("*").length - 1, rule).toBeLessThanOrEqual(1);
  });

  it("caches every content-hashed folder for a year, per product", () => {
    for (const base of ["", ...hosting.PRODUCT_BASE_PATHS]) {
      for (const dir of ["_expo", "assets"]) {
        expect(text).toContain(`${base}/${dir}/*\n  Cache-Control: public, max-age=31536000, immutable`);
      }
    }
  });

  it("sends the same security headers as Netlify", () => {
    // From the line that is exactly "/*" to the end.
    const security = (headers: string) => headers.slice(headers.indexOf("\n/*\n") + 1);
    expect(security(text)).toBe(security(hosting.netlifyHeaders()));
    expect(text).toContain(`Content-Security-Policy: ${hosting.CSP}`);
  });
});

describe("Cloudflare _routes.json", () => {
  const routes = hosting.cloudflareRoutes();

  it("runs the Worker for pages and APIs", () => {
    expect(routes).toMatchObject({ version: 1, include: ["/*"] });
  });

  it("keeps the content-hashed folders away from the Worker", () => {
    for (const base of ["", ...hosting.PRODUCT_BASE_PATHS]) {
      expect(routes.exclude).toContain(`${base}/_expo/*`);
      expect(routes.exclude).toContain(`${base}/assets/*`);
    }
  });

  it("never excludes an API path, and stays within the 100-rule limit", () => {
    for (const rule of routes.exclude) {
      expect(rule.startsWith("/api") || rule.startsWith("/.netlify")).toBe(false);
    }
    expect(routes.include.length + routes.exclude.length).toBeLessThanOrEqual(100);
  });
});

describe("spaIndexFor (the Worker fallback for a missing path)", () => {
  it.each([
    ["/", "/"],
    ["/expense", "/expense/"],
    ["/expense/", "/expense/"],
    ["/expense/dashboard", "/expense/"],
    ["/expense/settings/profile", "/expense/"],
    ["/nutrition/log", "/nutrition/"],
    ["/ganesh/members/abc", "/ganesh/"],
    ["/split/abc123", "/"],
    ["/payment/xyz", "/"],
    ["/random/deep/path", "/"],
    // A product prefix only matches a whole path segment.
    ["/expenses", "/"],
    ["/ganeshotsav/x", "/"],
  ])("%s -> %s", (pathname, index) => {
    expect(hosting.spaIndexFor(pathname)).toBe(index);
  });

  it.each([
    "/api/stock",
    "/api/unknown",
    "/api",
    "/.netlify/functions/nutrition-ai",
    "/expense/_expo/static/js/web/missing.js",
    "/_expo/nonexistent.js",
    "/ganesh/pwa-192.png",
    "/expense/manifest.webmanifest",
  ])("%s never falls back to a page", (pathname) => {
    expect(hosting.spaIndexFor(pathname)).toBeNull();
  });
});

describe("build-cloudflare-pages", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  function fakeWebExport(): string {
    dir = mkdtempSync(path.join(tmpdir(), "spendly-702-"));
    const from = path.join(dir, "dist-web");
    for (const base of ["", ...hosting.PRODUCT_BASE_PATHS]) {
      mkdirSync(path.join(from, base, "_expo"), { recursive: true });
      writeFileSync(path.join(from, base, "index.html"), `<html>${base || "root"}</html>`);
      writeFileSync(path.join(from, base, "_expo", "entry.js"), "js");
    }
    writeFileSync(path.join(from, "_redirects"), hosting.netlifyRedirects());
    writeFileSync(path.join(from, "_headers"), hosting.netlifyHeaders());
    return from;
  }

  it("copies the app, drops Netlify's _redirects and writes the Cloudflare rules", () => {
    const from = fakeWebExport();
    const to = path.join(dir, "dist-cloudflare");
    buildCloudflarePages(from, to);

    expect(readFileSync(path.join(to, "expense", "index.html"), "utf8")).toBe("<html>/expense</html>");
    expect(readFileSync(path.join(to, "ganesh", "_expo", "entry.js"), "utf8")).toBe("js");
    expect(existsSync(path.join(to, "_redirects"))).toBe(false);
    expect(readFileSync(path.join(to, "_headers"), "utf8")).toBe(hosting.cloudflareHeaders());
    expect(JSON.parse(readFileSync(path.join(to, "_routes.json"), "utf8"))).toEqual(hosting.cloudflareRoutes());
  });

  it("leaves dist-web untouched, so Netlify can still deploy it", () => {
    const from = fakeWebExport();
    buildCloudflarePages(from, path.join(dir, "dist-cloudflare"));
    expect(readFileSync(path.join(from, "_redirects"), "utf8")).toBe(hosting.netlifyRedirects());
    expect(readFileSync(path.join(from, "_headers"), "utf8")).toBe(hosting.netlifyHeaders());
  });

  it("refuses output over the Pages per-deployment limits", () => {
    const from = fakeWebExport();
    const to = path.join(dir, "dist-cloudflare");
    expect(() => buildCloudflarePages(from, to, { maxFiles: 5, maxFileBytes: 1 << 20 })).toThrow(/10 files is over the Cloudflare Pages limit of 5 per deployment/);
    expect(() => buildCloudflarePages(from, to, { maxFiles: 1000, maxFileBytes: 10 })).toThrow(/MiB per file: .*index\.html/);
    expect(() => buildCloudflarePages(from, to)).not.toThrow();
  });

  it("refuses an incomplete web export", () => {
    const from = fakeWebExport();
    rmSync(path.join(from, "nutrition"), { recursive: true });
    expect(() => buildCloudflarePages(from, path.join(dir, "dist-cloudflare"))).toThrow(/nutrition.*build:web:all/);
  });

  it("relocates assets/node_modules to vendor_modules and rewrites bundle references", () => {
    const from = fakeWebExport();
    // Simulate npm font assets exported by Metro under expense/assets/node_modules
    for (const w of ["400Regular", "500Medium", "600SemiBold", "700Bold"]) {
      const fontRelDir = path.join("expense", "assets", "node_modules", "@expo-google-fonts", "inter", w);
      mkdirSync(path.join(from, fontRelDir), { recursive: true });
      writeFileSync(path.join(from, fontRelDir, `Inter_${w}.hash.ttf`), "font-bytes");
    }
    // Bundle referencing the asset path
    writeFileSync(
      path.join(from, "expense", "_expo", "entry.js"),
      'exports = "/expense/assets/node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.hash.ttf";'
    );

    const to = path.join(dir, "dist-cloudflare");
    buildCloudflarePages(from, to);

    // In dist-cloudflare: assets/node_modules is gone, assets/vendor_modules is present
    expect(existsSync(path.join(to, "expense", "assets", "node_modules"))).toBe(false);
    expect(
      existsSync(path.join(to, "expense", "assets", VENDOR_ASSETS_DIR, "@expo-google-fonts", "inter", "400Regular", "Inter_400Regular.hash.ttf"))
    ).toBe(true);

    // References inside the bundle are rewritten
    const rewrittenBundle = readFileSync(path.join(to, "expense", "_expo", "entry.js"), "utf8");
    expect(rewrittenBundle).toContain(`/expense/assets/${VENDOR_ASSETS_DIR}/@expo-google-fonts`);
    expect(rewrittenBundle).not.toContain("assets/node_modules");

    // In dist-web: untouched, still has assets/node_modules
    expect(existsSync(path.join(from, "expense", "assets", "node_modules", "@expo-google-fonts", "inter", "400Regular", "Inter_400Regular.hash.ttf"))).toBe(true);
    expect(readFileSync(path.join(from, "expense", "_expo", "entry.js"), "utf8")).toContain("assets/node_modules");
  });

  it("assertNoIgnoredNodeModules catches any remaining node_modules folder", () => {
    const from = fakeWebExport();
    const to = path.join(dir, "dist-cloudflare");
    buildCloudflarePages(from, to);
    mkdirSync(path.join(to, "stray", "node_modules"), { recursive: true });
    expect(() => assertNoIgnoredNodeModules(to)).toThrow(/Wrangler would drop/);
  });
});
