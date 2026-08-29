# Deploying the public split share pages

> **Update:** `spendly-share.netlify.app` now also serves the full
> multi-product web app (`/expense`, `/nutrition`, `/ganesh`, `/`), deployed by
> `.github/workflows/web-deploy.yml` via `netlify deploy` (no --build flag), not by
> this site's own git-triggered build (`netlify.toml`, still below, is kept
> for reference only — continuous deployment must stay OFF for this site).
> `/split/:slug` and `/payment/:slug` keep working unchanged, served by the
> new deploy's "landing" bundle at the site root. Steps 1, 2 and 4 below are
> unaffected; steps 3 and 5 ("new build") now mean running the web-deploy
> workflow instead of relying on Netlify's own build.

The public pages (`/split/:slug`, `/payment/:slug`) are the Expo **web** export of
this repo, hosted on their **own** Netlify site with no dependency on any other
origin.

Read `docs/audits/SPLIT_SHARE_LINK_AUDIT_2026-08-22.md` if you want the history.
This file is the runbook.

Every step ends with a **Done when** block. If all five pass, sharing works
end to end — a friend with no account opens the link, sees who owes what, pays by
UPI, and can tell you they have paid. There is a combined check at the end.

Steps 1 and 2 are server-side and take effect immediately. Steps 3 and 5 need a
**new build**, because the app compiles the share origin into the links it
generates.

## Before you start: paste this once

Every snippet below uses these four variables, so **nothing in this file has a
placeholder to fill in**. Paste this into PowerShell once per session (it also
fetches a real split slug for you):

```powershell
$share  = "https://spendly-share.netlify.app"
$legacy = "https://kesavaexpensetracker.netlify.app"
$fs     = "https://firestore.googleapis.com/v1/projects/expenseapp-27f94/databases/(default)/documents"
$slug   = (& curl.exe -s "$fs/splitPublicShares?pageSize=1" | ConvertFrom-Json).documents[0].fields.slug.stringValue
"share = $share"
"slug  = $slug"
```

If `slug` comes back empty you have no shared splits yet — create one in the app
first, or list what exists:

```powershell
(& curl.exe -s "$fs/splitPublicShares?pageSize=20" | ConvertFrom-Json).documents |
  ForEach-Object { '{0}  {1}' -f $_.fields.slug.stringValue, $_.fields.title.stringValue }
```

The only other values this runbook needs are the Firebase project id
(`expenseapp-27f94`, already inside `$fs`) and the site name `spendly-share`.

## Shell note

Every command block is labelled **PowerShell** or **bash**. On Windows use the
PowerShell one — the differences are not cosmetic:

- `curl` in PowerShell is an alias for `Invoke-WebRequest`, which has no `-s`,
  stops to prompt you for `Uri:`, and then reads the URL as a drive name. Use
  **`curl.exe`** — real curl ships in `C:\Windows\System32` on Windows 10+.
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
- **forces** `/` to `public/home.html` with a **200** — forced because `/`
  resolves to the real `index.html` and Netlify will not shadow an existing file
  otherwise; 200 because netinfo's web reachability check is a same-origin
  `HEAD /` tested for `status === 200`, so a non-200 root makes the app report
  "No Internet Connection" on a page that loaded fine
- declares **no catch-all**, so any other path falls through to
  `public/404.html` with a real 404 — static, dependency-free, no app JS

Real files (`/_expo/**`, `/assets/**`, `/favicon.ico`, `/robots.txt`) keep being
served, which matters because `index.html` references those bundle paths
absolutely.

Verified against the real config with `netlify-cli dev`:

| Path | Result |
|---|---|
| `/split/:slug`, `/payment/:slug` | 200, boots the app |
| `/` | 200, `home.html`, **does not** boot the app |
| `/dashboard`, `/settings`, anything else | 404, `404.html`, **does not** boot the app |
| `/robots.txt`, bundles, fonts | 200, served |

---

## Step 1 — Deploy the Firestore rules

Self-service updates from the public page stay inert until the
`splitShareClaims` block is live; everything else works without it.

Same in both shells:

```powershell
npx firebase deploy --only firestore:rules --project expenseapp-27f94 --dry-run
npx firebase deploy --only firestore:rules --project expenseapp-27f94
```

To confirm afterwards that the rule is live, read a claim id that does not exist.
**404 means the rule exists, 403 means it does not:**

**PowerShell:**

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "$fs/splitShareClaims/nonexistent__probe"
```

> **Done when** that probe returns **404**. A 403 means the rule is not live and
> self-service will be refused. Nothing else depends on this step.

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

The six Firebase keys are the only ones this site needs. The share pages read
Firestore and render; they never generate a share URL, so neither
`EXPO_PUBLIC_SHARE_URL` nor `EXPO_PUBLIC_APP_URL` is required here. Setting
`EXPO_PUBLIC_SHARE_URL` anyway is harmless if you prefer both hosts configured
alike.

Do **not** set `EXPO_PUBLIC_GEMINI_API_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
`EXPO_PUBLIC_MARKET_API_URL`, or any `MYAPP_RELEASE_*` — they are inlined into a
public bundle and the share pages never use them.

> A missing Firebase var is the likely "it deployed but shows nothing" failure:
> `isFirebaseEnvConfigured()` returns false, `getFirestoreDb()` returns null, and
> the page renders "Splits aren't configured on this device."

**Nothing needs to change in the Vite repo.** No proxy, no service-worker
denylist. That approach is gone.

> **Done when** a real share link renders. **PowerShell:**
>
> ```powershell
> curl.exe -s "$share/split/$slug" | Select-String -Pattern '_expo/static/js/web/[^"]*' -AllMatches | ForEach-Object { $_.Matches.Value }
> ```
>
> Bundle paths printed = the site serves the app. Then open the page itself:
>
> ```powershell
> Start-Process "$share/split/$slug"
> ```
>
> Confirm you see the split's title and participants — **not** "Splits aren't
> configured on this device", which means a Firebase key is missing.

## Step 3 — Set the share URL for the mobile build

The app compiles the share origin into every link it generates, so this is the
step that decides whether the links you send actually point anywhere.

**Locally**, add to `.env` (see `.env.example`):

```
EXPO_PUBLIC_SHARE_URL=https://spendly-share.netlify.app
```

**For release builds**, adding a secret with that name is *not* enough on its
own — check which of the two paths in `.github/workflows/android-release.yml`
your repo uses:

- **If the `MOBILE_ENV_FILE` secret is set**, the workflow writes it verbatim as
  `.env` and ignores every individual secret. Edit that secret's contents and add
  the `EXPO_PUBLIC_SHARE_URL=...` line to it.
- **Otherwise** the workflow composes `.env` from individual secrets. Add an
  `EXPO_PUBLIC_SHARE_URL` repository secret; the workflow already knows to write
  it.

Either way the workflow now prints a **warning** if the key is missing, so a
release that would emit legacy-origin links tells you so in the build log.

**This step needs a new APK.** An existing install keeps using whatever origin it
was compiled with.

> **Done when** the origin is in the bundle you built. Run `npm run build:web`
> first, then — **PowerShell:**
>
> ```powershell
> Select-String -Path dist\_expo\static\js\web\entry-*.js -Pattern 'spendly-share\.netlify\.app' -Quiet
> ```
>
> `True` = compiled in. For the release APK, confirm the build log does **not**
> contain the `EXPO_PUBLIC_SHARE_URL is missing` warning. Then, on the device,
> tap Share on any split and check the link in the share sheet starts with
> `https://spendly-share.netlify.app/split/`.

## Step 4 — Verify

If you would rather run one thing than four, skip to
[*Is it working?*](#is-it-working-one-combined-check) below — it covers
everything in this step. The four checks are kept separate here so a failure
points at a cause.

**1. Share pages answer on the share host.** Bundle paths printed = working;
nothing printed = not working, whatever the status code says.

**PowerShell:**

```powershell
curl.exe -s "$share/split/$slug" | Select-String -Pattern '_expo/static/js/web/[^"]*' -AllMatches | ForEach-Object { $_.Matches.Value }
```

**bash:**

```bash
curl -s "$share/split/$slug" | grep -o '_expo/static/js/web/[^"]*'
```

**2. The host exposes nothing else.** No path outside `/split/*` and `/payment/*`
may boot the app bundle — `/` answers 200 with a static page, the rest answer 404.

**PowerShell:**

```powershell
foreach ($p in @('/','/dashboard','/settings','/ledger')) {
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 "$share$p"
  $boots = if ((& curl.exe -s --max-time 20 "$share$p") -match '_expo/static/js/web') { 'BOOTS APP - wrong' } else { 'static only - ok' }
  '{0,-12} {1}  {2}' -f $p, $code, $boots
}
```

**3. `/` must be 200, not 404.** netinfo probes it with a `HEAD` and treats
anything else as the internet being unreachable, which puts the app's "No
Internet Connection" banner on every share page.

**PowerShell:**

```powershell
curl.exe -s -o NUL -X HEAD -w "HEAD / -> %{http_code}  (must be 200)`n" "$share/"
```

**4. The legacy app is untouched**, since nothing was changed there.

**PowerShell:**

```powershell
& curl.exe -s -o NUL -w "  api:    %{http_code}`n" "$legacy/api/stock?symbol=RELIANCE"
& curl.exe -s -o NUL -w "  bridge: %{http_code}`n" "$legacy/mobile-google-auth"
```

Finally, open the real share link in a **fresh incognito window** and confirm the
split renders with participants and no sign-in prompt:

```powershell
"$share/split/$slug"
```

> **Done when** all four hold: bundle paths print for the share link; no path
> outside `/split/*` and `/payment/*` reports `BOOTS APP - wrong`; `HEAD /`
> returns **200**; and both legacy endpoints still return 200. The incognito page
> must show no sign-in prompt and **no "No Internet Connection" banner** — that
> banner means `/` is not answering 200.

## Step 5 — Light up the app-written fields

The snapshot fields behind currency, top-up labels and self-service are written
by the app, not the web build. On a build from before this change they are simply
absent, and the page degrades safely: INR fallback, no "This is me", "Unpaid"
instead of "Extra ₹25 due after Bob dropped out".

Once you are running a build with `EXPO_PUBLIC_SHARE_URL` set, **open each split
and tap Share once**. That single write backfills `publicSlug`, `currency`,
`claimKeys`, `claimAmountMax`, `claimsEnabled` and any missing per-person pay
links, and rewrites the public snapshot. Check one:

**PowerShell:**

```powershell
(& curl.exe -s "$fs/splitPublicShares?pageSize=20" | ConvertFrom-Json).documents |
  ForEach-Object {
    '{0,-14} currency={1,-5} claims={2}' -f $_.fields.slug.stringValue,
      $_.fields.currency.stringValue,
      $_.fields.claimsEnabled.booleanValue
  }
```

> **Done when** each split you shared shows a non-empty `currency` and
> `claims=True`. On the public page that means amounts in the right currency, a
> "This is me" control on each unpaid row, and — after you drop someone —
> "Extra ₹25.00 due after …" instead of "Unpaid" on people who had already paid.
> A split you have not re-shared keeps showing blanks here; that is expected, not
> a failure.

---

## Is it working? One combined check

Run this after all five steps. It exercises everything server-side in one go;
the two device-side confirmations are listed under Steps 3 and 5.

```powershell
$share = "https://spendly-share.netlify.app"
$fs = "https://firestore.googleapis.com/v1/projects/expenseapp-27f94/databases/(default)/documents"
$slug = ((& curl.exe -s "$fs/splitPublicShares?pageSize=1" | ConvertFrom-Json).documents[0].fields.slug.stringValue)
"slug under test: $slug"

$ok = $true
function check($label, $cond) {
  $script:ok = $script:ok -and $cond
  "{0,-6} {1}" -f $(if ($cond) { "PASS" } else { "FAIL" }), $label
}

check "rules deployed (claims probe returns 404)" `
  ((& curl.exe -s -o NUL -w "%{http_code}" "$fs/splitShareClaims/nonexistent__probe") -eq "404")
check "share page serves the app bundle" `
  ((& curl.exe -s "$share/split/$slug") -match '_expo/static/js/web')
check "root answers 200 (no false offline banner)" `
  ((& curl.exe -s -o NUL -X HEAD -w "%{http_code}" "$share/") -eq "200")
check "root does not boot the app" `
  (-not ((& curl.exe -s "$share/") -match '_expo/static/js/web'))
check "app routes are not exposed here" `
  (-not ((& curl.exe -s "$share/dashboard") -match '_expo/static/js/web'))
check "legacy market API still up" `
  ((& curl.exe -s -o NUL -w "%{http_code}" "https://kesavaexpensetracker.netlify.app/api/stock?symbol=RELIANCE") -eq "200")

$share_doc = (& curl.exe -s "$fs/splitPublicShares?pageSize=20" | ConvertFrom-Json).documents |
  Where-Object { $_.fields.slug.stringValue -eq $slug }
check "that split has been re-shared (currency present)" `
  ([bool]$share_doc.fields.currency.stringValue)
check "self-service enabled on that split" `
  ($share_doc.fields.claimsEnabled.booleanValue -eq $true)

""
if ($ok) { "ALL PASS - sharing is live." } else { "Something above failed - see the matching step." }
```

The last two can only pass for a split you have re-shared from a build carrying
`EXPO_PUBLIC_SHARE_URL` (Steps 3 and 5). Everything above them is independent of
the app build.

## Local development

Same in both shells:

```bash
npm run build:web
```

`npx expo serve` will **not** work — it has no SPA fallback and 404s on
`/split/abc`. Use something that honours `netlify.toml` — same in both shells:

```bash
npx netlify-cli dev --dir dist --offline --port 8899
```

`$slug` from the setup block at the top is a real slug; open
`http://localhost:8899/split/$slug`.

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
