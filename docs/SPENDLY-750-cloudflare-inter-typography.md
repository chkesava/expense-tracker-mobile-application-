# SPENDLY-750 — Fix Cloudflare Pages Backup Inter Typography Fallback

## Problem

The Spendly Expense web application rendered differently between the primary Netlify deployment (`https://spendly-share.netlify.app/expense/`) and the Cloudflare Pages backup (`https://spendly-web-backup.pages.dev/expense/`):
- **Netlify (Primary):** Typography appeared with the intended sans-serif Inter font family across all weights.
- **Cloudflare Pages (Backup):** Headings, navigation labels, and dashboard cards rendered using the browser's default serif / system fallback font.

## Root Cause & Reproducible Evidence

### 1. Font Asset URL Comparison
Inspection of the compiled web bundle (`/expense/_expo/static/js/web/entry-*.js`) revealed that Expo/Metro bundles fonts required from npm packages (`@expo-google-fonts/inter`) into paths preserving the package directory:
`/expense/assets/node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.51b6ad87261f18b6433ec52871ddfabc.ttf`

Testing HTTP requests to the live deployments:
- **Netlify:**
  `GET https://spendly-share.netlify.app/expense/assets/node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.51b6ad87261f18b6433ec52871ddfabc.ttf`
  -> **HTTP 200 OK**, `Content-Type: font/ttf`, `Cache-Control: public, max-age=31536000, immutable`
- **Cloudflare Pages:**
  `GET https://spendly-web-backup.pages.dev/expense/assets/node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.51b6ad87261f18b6433ec52871ddfabc.ttf`
  -> **HTTP 404 Not Found**, `Content-Type: text/html; charset=utf-8`

### 2. Why Cloudflare Pages Dropped the Font Assets
Cloudflare Pages uses `wrangler pages deploy` (or `wrangler pages publish`) to upload build artifacts from `dist-cloudflare/`. Wrangler's static asset collector uses a built-in hardcoded ignore filter matching `**/node_modules/**` to prevent uploading node modules directories.

Because Metro exported the web font and icon assets under `<product>/assets/node_modules/...`:
1. Wrangler completely excluded all files in `assets/node_modules/` during upload.
2. The font files were never deployed to Cloudflare Pages.
3. At runtime, Expo's `useFonts()` attempted to load `@font-face` from `/expense/assets/node_modules/...`.
4. The requests 404'd, causing `useFonts()` to set `fontError`.
5. Because `app/_layout.tsx` gates startup with `fontsSettled = fontsLoaded || Boolean(fontError)`, the app proceeded silently with the browser's fallback serif typography.

## Changes Made

### 1. Relocate Vendor Assets in Cloudflare Pages Build
In `scripts/build-cloudflare-pages.js`:
- Added `relocateVendorAssets(toDir)`:
  - Scans `dist-cloudflare/` and renames any `assets/node_modules` directory to `assets/vendor_modules`.
  - Replaces all occurrences of `assets/node_modules/` with `assets/vendor_modules/` in compiled JS bundles, HTML, JSON, CSS, and source maps.
- Because `vendor_modules` resides under `assets/`:
  - It matches existing `/*/assets/*` immutable caching rules (`Cache-Control: public, max-age=31536000, immutable`).
  - It is excluded from Worker invocations in `_routes.json` (served directly by Cloudflare Pages static CDN).
  - It satisfies CSP (`font-src 'self' data:`).
  - Wrangler does not ignore it, so all font and icon assets are uploaded.
- Added contract guards:
  - `assertNoIgnoredNodeModules(toDir)`: ensures 0 directories named `node_modules` exist in the Pages output.
  - `assertInterFontAssets(toDir)`: validates that all required Inter weights (`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`) exist on disk and are referenced by the bundle.

### 2. Runtime Error Visibility
In `app/_layout.tsx`:
- Added a `useEffect` on `fontError` using `logWarning("app.fonts", fontError)` from `lib/errors.ts` so font load failures are logged rather than silently masked.

### 3. Automated Smoke Check
In `scripts/smoke-web-backup.js`:
- Added `check('inter font asset', '/expense/', undefined, null)`:
  - Locates the bundle from `/expense/`.
  - Extracts the Inter font asset URL.
  - Fetches the font asset and verifies HTTP 200, valid font MIME type (not `text/html`), and `immutable` caching.

### 4. Workflow CI Guard
In `.github/workflows/web-deploy-cloudflare-backup.yml`:
- Added a verification check after `build:cloudflare-pages` that asserts no `node_modules` directory remains in `dist-cloudflare`.

### 5. Automated Tests
- `scripts/webHosting.test.ts`:
  - Verified `relocateVendorAssets` renames `assets/node_modules` to `assets/vendor_modules` and rewrites bundle references.
  - Verified `dist-web/` is untouched so Netlify deployment behavior is unaffected.
  - Verified `assertNoIgnoredNodeModules` catches any remaining `node_modules` directory.
- `scripts/smokeWebBackup.test.ts`:
  - Added tests for `inter font asset` smoke check passing on valid deployment and failing on 404 or HTML response.

## Validation
- `npx vitest run scripts/webHosting.test.ts` (34 passed)
- `npx vitest run scripts/smokeWebBackup.test.ts` (21 passed)
- `npm run typecheck:shared` (clean, 0 errors)
- Read-model guards:
  - `lib/readModelWriteHooks.test.ts`
  - `netlify/functions/readmodelServerPush.test.ts`
  - `lib/readModelLocal/providerSwitch.test.ts`
  - `lib/readModelLocal/listenersOff.test.ts`
  - `shared/utils/readModel/mapping.test.ts`
  - `scripts/readmodelCrossUserIndexes.test.ts`
  (342 passed)
