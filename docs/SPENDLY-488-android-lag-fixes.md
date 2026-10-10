# SPENDLY-488: Android lag fixes

**Epic:** fixes from the 2026-10-10 device diagnosis. The measurements and ranked findings are in `docs/PERF_DIAGNOSIS_2026-10-10.md`.

| Story | Title | State |
|---|---|---|
| SPENDLY-489 | Chart animations: stop per-node SVG animated props | Merged to epic (b34730a); device check pending |
| SPENDLY-490 | Journal: stop onEndReached auto-paging the whole ledger | Merged to epic (a4eea9e); device check pending |
| SPENDLY-491 | Saves: read account info from memory or cache, not a server getDoc | Merged to epic (1902d04) |
| SPENDLY-492 | Enable R8 minify and resource shrinking for release builds | Merged to epic (fe97453); device smoke test pending |
| SPENDLY-493 | AOT-compile after sideload installs | Merged to epic (b0ade81) |

## Decisions
- Stories land one at a time on `feature/SPENDLY-488-android-lag-fixes`. The epic merges to `main` only when every story is done and the user asks.
- All five stories are merged to the epic (2026-10-10). Before the epic goes to `main`: run a device check on Spendly Test, installed with `npm run android:install`. It must cover the charts (489), Journal paging (490), save latency (491), an R8 smoke test of launch, sign-in, add/edit, charts, accounts and settings (492), and the dexopt status after install (493).
