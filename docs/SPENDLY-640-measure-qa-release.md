# SPENDLY-640 — Measurement, QA and release plan

Epic: SPENDLY-633. Scope chosen by the owner (2026-10-31): **Expense only** —
no Nutrition/Ganesh test builds. Measurement was then **stopped by the owner**
before any timings were taken; this records what was done and what remains.

## Verified
- **Production config, all three apps** (resolved `app.config.js`): each
  package (`com.example.expensetracker`, `…nutritiontrackera`,
  `…ganeshseva`) is a client in `google-services.json`; the RNFB app/auth
  plugins are present; the test-only cleartext plugin is absent.
- Device checks already done on Spendly Test in SPENDLY-638/639: upgrade
  note, native sign-in, offline cold start from the on-device cache, sign-out
  and same-session sign-in, and an offline write applied exactly once.

## Not done (stopped)
- Before/after cold-start timings and Firestore reads per launch.
  On the QA phone (CPH2661) logcat drops most `ReactNativeJS` lines even with
  the app's UID whitelisted from pruning (`logcat -P`; the original prune
  list `~! ~1000/!` was restored), so a timing run needs an on-screen read-out
  of the perf marks. A temporary harness was built and then removed unused.
- Production `assembleRelease` compile checks of the three apps.

## Release plan (after the epic is merged to main — owner's go-ahead)
1. Merge latest `main` into the epic first (main moved on: e.g. #245
   SPENDLY-622), re-run PR Checks.
2. Release **Expense** first. Check on a real device, against production:
   - **Google sign-in** (cannot be tested on Spendly Test: no OAuth client) —
     native `signInWithCredential` with the Google ID token;
   - existing users see the one-time "Please sign in once more" note;
   - dashboard draws from cache on a second cold start; offline launch;
   - sign-out and sign-in.
3. Then Nutrition, then Ganesh (Ganesh phone sign-in now completes through
   native Auth — check it first on its release build).
4. Watch for the SPENDLY-638 "note already dismissed on first upgrade"
   oddity seen once on the emulator.
