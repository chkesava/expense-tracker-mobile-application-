# After merge — what you still need to ship

Merging to `main` does **not** deploy Firestore rules, the web app, or an
Android APK. CI only tests. You run the leftover steps below.

Full rules background: [FIREBASE_RULES_DEPLOY.md](./FIREBASE_RULES_DEPLOY.md).
Android pipeline: [README.md](../README.md) → Automated releases.
Web pipeline: `.github/workflows/web-deploy.yml`.

Firebase project: **`expenseapp-27f94`**.

---

## Order (do not skip this)

When a ticket **tightens** client writes (the usual security ticket):

1. Merge to `main`.
2. Ship the **new app** (web, then Android if native users exist).
3. Then deploy **Firestore rules**.

Old native builds still try the old write. If rules go live first, those users
get permission-denied until they update. Web is instant once you run the Netlify
workflow; Android lags until testers install the new APK.

When a ticket only **adds** a client write that new rules already allow, deploy
rules first (or together) so the new app is not denied.

### SPENDLY-22 — the privacy PIN stops syncing

This one has a user-visible consequence that belongs in the release note, not
just the changelog. The PIN moved from `users/{uid}` to device-local storage
([`SPENDLY-22-privacy-lock-boundary.md`](./SPENDLY-22-privacy-lock-boundary.md)),
and the first upgraded device clears the Firestore fields.

So **a second device still on the old build loses its lock** until it updates —
nobody is locked out and nothing is deleted, but the lock is simply absent
there. Same for a brand-new device: the PIN no longer follows the account, so
it must be set again per device.

Ship web and Android reasonably close together to keep that window short, and
say so in the release note.

---

## 1. Pick what this ticket actually changed

Tick only the rows that match the diff.

| Changed in the PR | You still need to |
|---|---|
| `firestore.rules` | Deploy Firestore rules |
| `firestore.indexes.json` | Deploy indexes (see warning below) |
| `storage.rules` | Deploy Storage rules |
| `functions/` | Deploy Cloud Functions |
| App / providers / hooks / screens | Netlify web build **and** Android if people use the APK |
| Docs / tests only | Nothing to ship |

---

## 2. Firestore rules (manual GitHub Action)

Merges do **not** deploy rules. After the new app is out (if this ticket
tightens writes):

1. Open [Deploy Firestore rules](https://github.com/chkesava/expense-tracker-mobile-application-/actions/workflows/firestore-rules-deploy.yml).
2. **Run workflow** on `main`.
3. Leave **dry_run** checked for a preview; uncheck it to upload. A compiler
   `[W]` fails the job before anything is uploaded when the service account
   can call the Rules API. The Action skips the Firebase CLI's Service Usage
   probe. Until `FIREBASE_SERVICE_ACCOUNT` has **Firebase Rules Admin**, a
   dry-run still passes (emulator suite compiled the rules) and a real
   upload fails with the IAM leftover.
4. Leave **deploy_indexes** off unless live indexes are already in
   `firestore.indexes.json` (a naive index deploy deletes live indexes that
   are missing from the file).

Done when the Action prints `Deploy complete` and Firebase console → Firestore
→ Rules shows the new file.

Local CLI still works (Firebase CLI + **JDK 21**; `firebase.json` runs
`npm run test:rules` as a predeploy hook; JDK 17 will abort the deploy):

```bash
firebase login
firebase deploy --only firestore:rules --project expenseapp-27f94 --dry-run
firebase deploy --only firestore:rules --project expenseapp-27f94
```

**Do not** deploy the sibling Vite repo’s `firestore.rules` over this project.

Rollback: Firebase console → Firestore → Rules → History, then revert the git
commit so repo and live stay in sync.

### Indexes (only if `firestore.indexes.json` changed)

Dump live indexes and diff them against the file before deploying. The
GitHub Action does this and refuses the upload when live indexes are missing
from the file.

```bash
firebase firestore:indexes --project expenseapp-27f94
firebase deploy --only firestore:indexes --project expenseapp-27f94
```

This **deletes live indexes that are not in the file**. Index builds are async;
queries fail with `failed-precondition` until they finish.

### Storage (only if `storage.rules` changed)

```bash
firebase deploy --only storage --project expenseapp-27f94
```

### Cloud Functions (only if `functions/` changed)

```bash
firebase deploy --only functions --project expenseapp-27f94
```

---

## 3. Netlify / web (manual GitHub Action)

Merges do **not** publish the site. Netlify’s own git auto-build on
`spendly-share` must stay **off** (a dashboard auto-build would overwrite this
workflow).

1. Open [Deploy Web (Netlify)](https://github.com/chkesava/expense-tracker-mobile-application-/actions/workflows/web-deploy.yml).
2. **Run workflow** on `main`.
3. Wait for the `rules` job and the deploy job (it also runs `npm test` and typecheck).

That publishes all four surfaces together:

- https://spendly-share.netlify.app/
- https://spendly-share.netlify.app/expense
- https://spendly-share.netlify.app/nutrition
- https://spendly-share.netlify.app/ganesh
- `/split/<slug>` and `/payment/<slug>` stay on the same site

`kesavaexpensetracker.netlify.app` is the **legacy Vite** site. This repo does
not deploy it.

---

## 4. Android APK (manual GitHub Action)

Merges do **not** start a build. Use the **per-product** workflows (not the
legacy combined “Android Release” unless you still need that old APK):

| Product | Action |
|---|---|
| Spendly | [Release — Expense](https://github.com/chkesava/expense-tracker-mobile-application-/actions/workflows/release-expense.yml) |
| Nutrition | [Release — Nutrition](https://github.com/chkesava/expense-tracker-mobile-application-/actions/workflows/release-nutrition.yml) |
| Ganesh Seva | [Release — Ganesh](https://github.com/chkesava/expense-tracker-mobile-application-/actions/workflows/release-ganesh.yml) |

For a Spendly Firebase ticket, Expense is the one that matters. Run Nutrition /
Ganesh too when the change is in **shared** Firebase code (`firestore.rules`,
`providers/`, `lib/firebase.ts`, auth) because all three products share the
same project.

1. **Run workflow** on `main`.
2. Leave **version** empty unless you want an explicit name (defaults to a patch bump).
3. Set **mandatory** only if old clients must update before they can continue
   (use this when live rules will break the old APK).
4. Wait for: signed APK → GitHub Release → App Distribution email →
   `system_settings/latest_release_*` so the in-app update prompt fires.

Install the new APK (or take the in-app update) **before** you deploy tightening
rules, if native users are still on the old write path.

---

## 5. App Check (only if the PR added `lib/appCheck`)

Web tokens need a reCAPTCHA Enterprise site key in
`EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY` (Netlify env + local `.env`).
Android Play Integrity is **not** in this JS-SDK app — do **not** turn on
Enforce in Firebase console → App Check until native clients send tokens, or
Android users get `app-check-token` failures.

---

## 6. Smoke after leftovers

- Web: sign in on `/expense` (and `/ganesh` if shared). Hit the changed flow.
- Android: same flow on the new APK. Confirm the in-app update prompt if you
  shipped a release.
- Rules: the old forbidden write now fails (Firebase console or a throwaway
  `setDoc` in a scratch page). The new allowed path still works.

---

## Copy-paste leftover for Jira

Paste this on the ticket when code is on `main`. Delete rows that do not apply.

```
Leftovers (see docs/AFTER_MERGE_CHECKLIST.md):

- [ ] GitHub → Actions → Deploy Web (Netlify) → Run workflow on main
      (nutrition-ai needs GEMINI_API_KEY on the Netlify site; the workflow
      copies GitHub GEMINI_API_KEY or the old EXPO_PUBLIC_GEMINI_API_KEY)
- [ ] GitHub → Actions → Release — Nutrition → Run workflow on main
      (Spendly/Ganesh APKs no longer need the Gemini key)
- [ ] Rotate the Gemini key in Google Cloud once the proxy is live, then
      delete EXPO_PUBLIC_GEMINI_API_KEY from GitHub secrets / MOBILE_ENV_FILE
- [ ] GitHub → Actions → Release — Expense → Run workflow on main
      (also Nutrition / Ganesh if the change is shared Firebase)
- [ ] GitHub → Actions → Deploy Firestore rules → Run workflow on main
      (uncheck dry_run to upload; after the new app is out if this ticket
      tightens writes). Do not deploy indexes unless live indexes are in
      firestore.indexes.json.
- [ ] Storage / Functions only if those files changed
- [ ] App Check (only if this ticket added client init):
      Firebase console → App Check → register Web (reCAPTCHA Enterprise)
      and put the site key in Netlify `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY`.
      Play Integrity for Android needs `@react-native-firebase/app-check` (not
      this JS SDK). Do **not** enforce until Android tokens exist.
```
