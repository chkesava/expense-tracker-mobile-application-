# Deploying the public split share pages

The public pages (`/split/:slug`, `/payment/:slug`) are the Expo **web** export of
this repo, hosted on their **own** Netlify site with no dependency on any other
origin.

Read `docs/audits/SPLIT_SHARE_LINK_AUDIT_2026-08-22.md` if you want the history.
This file is the runbook.

## Shell note

Commands are given for both bash and PowerShell, because the differences here
are not cosmetic:

- `curl` in PowerShell is an alias for `Invoke-WebRequest`, which has no `-s` and
  will stop and prompt you for `Uri:`. Use **`curl.exe`** — real curl ships in
  `C:\Windows\System32` on Windows 10+.
- There is no `grep`. Use `Select-String`.
- `/dev/null` is `NUL`, and a literal newline in `-w` is a backtick-n.

**Never verify a share page by its HTTP status code alone.** A status code tells
you the host answered, not *which page* it answered with. Check the body — a real
share page references `_expo/static/js/web/...`.

---

## Architecture

Two origins, cleanly separated. Nothing about sharing crosses between them.

| Origin | Serves | Set by |
|---|---|---|
| `spendly-share.netlify.app` | `/split/:slug`, `/payment/:slug` — the login-free share pages, built from this repo | `EXPO_PUBLIC_SHARE_URL` |
| `kesavaexpensetracker.netlify.app` | `/api/*` market functions and `/mobile-google-auth`, from the legacy Vite repo | `EXPO_PUBLIC_APP_URL` |

`EXPO_PUBLIC_SHARE_URL` exists precisely so those can move independently. It used
to be one variable doing both jobs, which is why share links pointed at the legacy
app and had to be proxied across from it. **They no longer are.**
`getPublicAppOrigin()` in `shared/utils/paymentRequestUrl.ts` prefers the share
variable, falling back to the app variable only so an older build keeps working.

The legacy app still owns two backend dependencies — market quotes and the Expo Go
Google bridge. Moving those means porting Netlify functions; it is separate,
larger work and is not required for sharing.

### The share host is not a second copy of the app

`index.html` boots the whole app, so a blanket `/* -> /index.html` fallback would
make `/dashboard`, `/settings` and every other route reachable on the share
domain — a second origin where someone could sign in. `netlify.toml` therefore:

- serves `index.html` for **only** `/split/*` and `/payment/*`
- **forces** `/` to `404.html` (forced because `/` resolves to the real
  `index.html`, and Netlify will not shadow an existing file otherwise)
- declares **no catch-all**, so any other path falls through to
  `public/404.html` — static, dependency-free, no app JS

Real files (`/_expo/**`, `/assets/**`, `/favicon.ico`, `/robots.txt`) keep being
served, which matters because `index.html` references those bundle paths
absolutely.

Verified against the real config with `netlify-cli dev`:

| Path | Result |
|---|---|
| `/split/:slug`, `/payment/:slug` | 200, boots the app |
| `/`, `/dashboard`, `/settings` | 404, static page, **does not** boot the app |
| `/robots.txt`, bundles, fonts | 200, served |

---

## Step 1 — Deploy the Firestore rules

Self-service updates from the public page stay inert until the
`splitShareClaims` block is live; everything else works without it.

```bash
npx firebase deploy --only firestore:rules --project expenseapp-27f94 --dry-run
```

```bash
npx firebase deploy --only firestore:rules --project expenseapp-27f94
```

Identical in PowerShell. To confirm afterwards that the rule is live, read a
claim id that does not exist — **404 means the rule exists, 403 means it does
not**:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "https://firestore.googleapis.com/v1/projects/expenseapp-27f94/databases/(default)/documents/splitShareClaims/nonexistent__probe"
```

## Step 2 — The Netlify site

Netlify → Add new site → Import an existing project → GitHub → this repo.

- **Site name:** `spendly-share`. It must match `EXPO_PUBLIC_SHARE_URL`.
- **Build settings:** leave blank. `netlify.toml` in this repo overrides the UI.
- **Production branch:** `main`. Turn **branch deploys off** — each is a fresh
  ~14 MB bundle.

**Environment variables** (scope: all, every deploy context):

| Key | Value |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | same as the Android build |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | same |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER` | same |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | same |
| `EXPO_PUBLIC_SHARE_URL` | `https://spendly-share.netlify.app` |

Do **not** set `EXPO_PUBLIC_GEMINI_API_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
`EXPO_PUBLIC_MARKET_API_URL`, or any `MYAPP_RELEASE_*` — they are inlined into a
public bundle and the share pages never use them. `EXPO_PUBLIC_APP_URL` is not
needed here either; nothing these pages render touches it.

> A missing Firebase var is the likely "it deployed but shows nothing" failure:
> `isFirebaseEnvConfigured()` returns false, `getFirestoreDb()` returns null, and
> the page renders "Splits aren't configured on this device."

**Nothing needs to change in the Vite repo.** No proxy, no service-worker
denylist. That approach is gone.

## Step 3 — Set the share URL for the mobile build

The app generates share links, so the origin has to be compiled into the build.

Add to your local `.env` (see `.env.example`):

```
EXPO_PUBLIC_SHARE_URL=https://spendly-share.netlify.app
```

The Android release workflow restores `.env` from repository secrets, so add
`EXPO_PUBLIC_SHARE_URL` there too — otherwise a release build silently falls back
to `EXPO_PUBLIC_APP_URL` and emits links to the legacy app again. Confirm it
landed in a built bundle:

```powershell
Select-String -Path dist\_expo\static\js\web\entry-*.js -Pattern 'spendly-share\.netlify\.app' -Quiet
```

**This step needs a new APK.** An existing install keeps using whatever origin it
was compiled with.

## Step 4 — Verify

Share pages answer on the share host:

```bash
curl -s https://spendly-share.netlify.app/split/<slug> | grep -o '_expo/static/js/web/[^"]*'
```

```powershell
curl.exe -s https://spendly-share.netlify.app/split/<slug> | Select-String -Pattern '_expo/static/js/web/[^"]*' -AllMatches | ForEach-Object { $_.Matches.Value }
```

Bundle paths printed = working. Nothing printed = not working, whatever the
status code says.

Then confirm the host exposes nothing else — `/` and any app route must be **404
without the app bundle**:

```powershell
foreach ($p in @('/','/dashboard','/settings','/ledger')) {
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 "https://spendly-share.netlify.app$p"
  $boots = if ((& curl.exe -s --max-time 20 "https://spendly-share.netlify.app$p") -match '_expo/static/js/web') { 'BOOTS APP - wrong' } else { 'static only - ok' }
  '{0,-12} {1}  {2}' -f $p, $code, $boots
}
```

And that the legacy app is untouched, since nothing was changed there:

```powershell
& curl.exe -s -o NUL -w "  api:    %{http_code}`n" "https://kesavaexpensetracker.netlify.app/api/stock?symbol=RELIANCE"
& curl.exe -s -o NUL -w "  bridge: %{http_code}`n" "https://kesavaexpensetracker.netlify.app/mobile-google-auth"
```

Finally, open a real share link in a **fresh incognito window** and confirm the
split renders with participants and no sign-in prompt.

## Step 5 — Light up the app-written fields

The snapshot fields behind currency, top-up labels and self-service are written
by the app, not the web build. On a build from before this change they are simply
absent, and the page degrades safely: INR fallback, no "This is me", "Unpaid"
instead of "Extra ₹25 due after Bob dropped out".

Once you are running a build with `EXPO_PUBLIC_SHARE_URL` set, **open each split
and tap Share once**. That single write backfills `publicSlug`, `currency`,
`claimKeys`, `claimAmountMax`, `claimsEnabled` and any missing per-person pay
links, and rewrites the public snapshot. Check one:

```powershell
(& curl.exe -s "https://firestore.googleapis.com/v1/projects/expenseapp-27f94/databases/(default)/documents/splitPublicShares?pageSize=20" | ConvertFrom-Json).documents |
  ForEach-Object {
    '{0,-14} currency={1,-5} claims={2}' -f $_.fields.slug.stringValue,
      $_.fields.currency.stringValue,
      $_.fields.claimsEnabled.booleanValue
  }
```

## Local development

```bash
npm run build:web
```

`npx expo serve` will **not** work — it has no SPA fallback and 404s on
`/split/abc`. Use something that honours `netlify.toml`:

```bash
npx netlify-cli dev --dir dist --offline --port 8899
```

Get a real slug from the Firebase console, or without leaving the shell:

```powershell
(& curl.exe -s "https://firestore.googleapis.com/v1/projects/expenseapp-27f94/databases/(default)/documents/splitPublicShares?pageSize=20" | ConvertFrom-Json).documents |
  ForEach-Object { '{0}  {1}' -f $_.fields.slug.stringValue, $_.fields.title.stringValue }
```

> **Known local-only quirk:** `netlify dev --dir --offline` returns **403 for
> every nested static path** (`/_expo/**`, `/assets/**`), so the page looks broken
> locally even when routing is correct. It does this on any config — live Netlify
> serves the 7.4 MB bundle and the 342 KB fonts as 200. Use it to check
> *redirects*, not asset delivery. It also writes `.netlify/`, `deno.lock` and a
> `.gitignore` line; delete those afterwards.

## Notes

- Entry bundle is ~1.4 MB gzipped, because expo-router's default `sync` import
  mode pulls every route into the entry chunk (largest contributor:
  `lucide-react-native`, whose web entry is a barrel over ~1,700 icon modules
  Metro does not tree-shake). Acceptable for a page nobody visits twice. If it
  ever matters, try `asyncRoutes: { "web": "production" }` in the `expo-router`
  plugin options — alpha and web-only, so revert if the export misbehaves.
- Firebase **authorized domains** need no change: the share pages make no auth
  call, and Firestore authenticates with the API key and project id rather than
  the origin. With the fallback scoped as above there is no sign-in surface on the
  share host to authorize.
- Share links issued by builds from before Step 3 point at
  `kesavaexpensetracker.netlify.app/split/...` and will not resolve, because
  nothing proxies them. They never worked — that origin has always served the
  legacy app's login screen for those paths — so nothing regressed. Reshare from a
  current build to hand out a working link.
