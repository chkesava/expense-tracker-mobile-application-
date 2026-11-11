# SPENDLY-753 — Web category picker: duplicates, missing subcategories, unfocused add inputs

Bug, standalone (no epic). Branch `fix/SPENDLY-753-category-picker-dedup-focus` from `main`.

## The report
Web category/subcategory picker diverges from Android: duplicate category names render, some custom subcategories go missing, selecting a parent sometimes shows only "Other", and the "+" add-category/add-subcategory inputs don't receive keyboard focus on web.

## Root causes (confirmed by code inspection, SPENDLY-712/722/742 unaffected)
1. **Read truncation.** `providers/ExpenseReferenceDataProvider.tsx`'s categories query and `hooks/useCategories.ts`'s `categoriesForWrite()` capped Firestore reads at `limit(500)` with no `orderBy`, on a comment assuming "~190 docs per user" — already disproven in production (SPENDLY-712: 1,665 category docs for one user). The Supabase/on-device-copy branch also passed `{ limit: 500 }` to `categoriesSource.subscribe`, even though `queryCopy` (`lib/readModelLocal/readSource.ts`) already reads the entire local copy table and only re-truncated it afterward in memory.
2. **No write-time dedup.** `addCategory`/`addSubcategory` wrote a fresh random doc id via raw `setDoc` with no check for an existing active category/subcategory of the same (trimmed, case-insensitive) name. `renameCategory`/`updateCategory` had the same gap. The default-taxonomy migration (`shared/data/categoryHierarchyPlan.ts`) explicitly never touches custom (`isDefault === false`) docs, so duplicate custom categories were never cleaned up by any existing path.
3. **No render-time defense, and a wrong-duplicate-resolves bug.** `parentCategories`/`getSubcategories` rendered every matching doc with no dedup; `getSubcategories`'s parent lookup fell back to `categories.find(c => c.name === parentIdOrName)`, which could silently resolve to the "wrong" one of two same-named parent docs and show that parent's own (possibly empty) subcategory set.
4. **Focus.** `CategoryPicker.tsx`'s inline add forms relied on the RN `autoFocus` prop on a conditionally-mounted `TextInput` (unreliable on web).

## The fix

| Area | Where | What |
|---|---|---|
| Read completeness | `providers/ExpenseReferenceDataProvider.tsx`, `hooks/useCategories.ts` | Removed the `limit(500)` caps (Firestore query, Supabase subscribe options, `categoriesForWrite`); `getDocs`/`onSnapshot` with no `limit()` already returns every doc in one call, matching `lib/ensureCategoryHierarchy.ts`'s existing full-read pattern. Added a sanity-cap warning log (>3000) so a future runaway-duplication bug stays visible. |
| Write-time dedup | `shared/utils/categoryModel.ts` (new), `firestore.rules`, `lib/commitMutations.ts`, `hooks/useCategories.ts` | A `categoryNames/{key}` / `categorySubNames/{key}` create-only name lock, identical in shape to Save Goals' `goalNames/{key}` (`shared/utils/goalModel.ts`, `goalWrites.ts`). `addCategory`/`addSubcategory` write the category doc and its lock in one `trackedBatch`; a duplicate name's lock create is rejected by rules as an `update` (`allow update: if false`), failing the whole batch. `renameCategory`/`updateCategory` claim the new key and release the old one (only when one was actually claimed — a legacy doc has neither field). `archiveCategory` releases the lock, clearing the `nameKey`/`subNameKey` field in the same batch (the rule's delete condition checks it). Pre-checks against the in-memory list give an immediate "That name already exists" toast; the lock is what actually prevents a race or an offline retry from creating a second doc. |
| Render-time defense | `hooks/useCategories.ts` | `parentCategories`/`getSubcategories` group by `normalizeCategoryName` (parents globally, subcategories scoped to the resolved logical parent) and keep one canonical doc per group (prefer `isDefault`, else oldest, else lowest id) — no Firestore doc is touched. `getSubcategories` now resolves every active parent doc sharing a normalized name and merges their subcategories, instead of trusting whichever duplicate an unstable `.find()` landed on. |
| Live-data audit (read-only) | `scripts/categoryDuplicateAudit.ts`, `scripts/lib/categoryDuplicateAuditCore.ts` | Paginate-free (no cap) Firestore + Supabase category read for a uid; reports counts, duplicate groups, cross-store gaps, and inconsistent metadata. `--plan` adds a dry-run repair mapping (canonical id ← duplicates) using the same `dedupeByNormalizedName` rule the picker uses — nothing is ever written. |
| Focus | `components/categories/CategoryPicker.tsx` | Both inline add inputs (`add parent`, `add subcategory`) now carry a `useRef<TextInput>` plus a `useEffect` that calls `.focus()` on `requestAnimationFrame` after the input mounts, alongside the existing `autoFocus` prop (native). `components/categories/CategoryManager.tsx`'s add-subcategory input is deliberately left alone — it's not behind a "+" toggle, it's always shown once a parent row is expanded, so auto-focusing it would pop the keyboard on every expand (a new regression, not a fix). |

## Not changed
- `CategoryPicker.tsx`'s subcategory auto-validation still keys off the **committed** `category` prop, never the draft parent (SPENDLY-722) — untouched by this story; `shared/utils/categorySelection.test.ts` re-run to confirm.
- No existing category/subcategory document was merged, archived, or deleted. The audit's `--plan` output is a report only; executing any merge/archive needs its own ticket and the user's explicit approval.
- No Supabase migration/RLS/allowlist/purge work: `categoryNames`/`categorySubNames` are pure Firestore write-time plumbing with no screen reading them, following the `goalNames` precedent exactly (not in `shared/utils/readModel/mapping.ts`, not in `SWITCHED_COLLECTIONS`).

## Tests
- `shared/utils/categoryModel.test.ts` (new, 7): normalization, parent/subcategory-scoped keys, taken-checks, dedup canonical-choice rule.
- `firestore/categoryNames.rules.test.ts` (new): create-only lock, duplicate name rejected whole-batch, archive-then-reuse, cross-doc key check, hijack/rename/release.
- `scripts/lib/categoryDuplicateAuditCore.test.ts` (new, 7): counts, duplicate grouping (parent-wide / per-parent), cross-store gaps, metadata issues, repair-mapping canonical choice.
- No `hooks/useCategories.test.ts`: this repo has no hook-level test harness anywhere (`hooks/*.test.ts` doesn't exist for any hook) — the decision logic that matters is in the now-tested pure `categoryModel.ts`, and the write-time enforcement is proven end-to-end by the rules test. Verified manually on local Expo web instead (see below).
- Re-run, unaffected: `shared/utils/categorySelection.test.ts`, `lib/categoryRevision.test.ts`, `lib/ensureCategoryHierarchy.test.ts`, `lib/readModelWriteHooks.test.ts`, `lib/commitMutations.test.ts`.

## Live Firestore ↔ Supabase Category Audit
**Environment:** local Firebase emulator (`demo-spendly`), demo account `demo-spendly-user` (per `docs/LOCAL_TEST_MODE.md`) — the real affected prod account's uid/email hasn't been shared yet; that half is still pending (see "Unresolved risks").

**Retrieval method:** `scripts/categoryDuplicateAudit.ts --uid=demo-spendly-user --plan`, which reads the full `users/{uid}/categories` collection via the Admin SDK with no `limit()` — confirmed exhaustive by construction, the same fix applied to the app's own read.

**Run 1 — the seeded demo account as-is:** 0 categories (the demo seed script doesn't create categories; the app seeds them on first sign-in, which this session didn't do). Confirms the script runs cleanly end-to-end with nothing to report.

**Run 2 — with 5 synthetic docs seeded directly into the emulator** (2 duplicate parents named "Maintenance and Repair Services" with whitespace/case variants — the exact example from the ticket — 1 unrelated parent, 2 duplicate subcategories "Groceries"/"groceries" under it):
- Firestore vs Supabase parity: not evaluated this run (`READMODEL_SUPABASE_URL`/`READMODEL_SUPABASE_SERVICE_ROLE_KEY` unset locally; the script says so explicitly in its output rather than silently reporting a false parity).
- Duplicate groups found: 1 parent group (`p1`, `p2` — "Maintenance and Repair Services"), 1 subcategory group scoped to its parent (`s1`, `s2` — "Groceries" under `p3`).
- Metadata issue found: the seeded default parent had no `semanticKey` (expected — it's synthetic test data, not a real finding).
- Dry-run repair plan: proposed `p1` and `s1` as canonical (oldest by `createdAt`, since neither was marked default) — matches exactly what `hooks/useCategories.ts`'s render-time dedupe would already show as the one surviving row.
- The synthetic docs were deleted afterward; nothing was left in the emulator beyond the normal seed.

**Confirmed root causes** (both from static analysis and this live run): (1) the `limit(500)`/no-`orderBy` read truncation, now removed; (2) no write-time or render-time dedup, now added. **Hypothesis, not yet confirmed against real prod data:** whether the actually-reported account's duplicates specifically match the "wrong duplicate parent resolves" pattern in `getSubcategories`, or a different mechanism. That needs the real account's audit (Run 3, pending).

**No live data was mutated** at any point — both runs were read-only against the emulator; the 5 synthetic docs were written and deleted by a throwaway script against the *local emulator only*, never production.

## Verification
- `npm test` — **662/662 test files pass** (9,061 tests; includes the new `shared/utils/categoryModel.test.ts`, `scripts/lib/categoryDuplicateAuditCore.test.ts`, and the updated `lib/readModelLocal/providerSwitch.test.ts` count/regex assertions).
- `npx tsc -p tsconfig.json --noEmit` — 0 errors.
- `npm run typecheck:shared` — 0 errors.
- `npm run test:rules` — **38/38 rules test files pass** (706 tests), including the new `firestore/categoryNames.rules.test.ts` (11 tests: create-only lock, duplicate-name rejection, archive-then-reuse, cross-doc key check, hijack/rename/release, parent-scoped subcategory locks).
- `scripts/verify-performance-budgets.js`'s `verifyReferenceQueriesBounded` guard updated: `categories` removed from its `boundedCollections` list with an inline explanation (the `limit(500)` it was protecting *was* the bug).
- Manual Expo web check: **not done in this session** — no browser available here. Per the project's convention (`[User does UI review]`), this is for the user to check on local Expo web with demo data before merge: new parent/subcategory add input receives focus and accepts typing; a duplicate name is rejected with a toast; Add/Edit expense category flows still work; SPENDLY-722's no-flip behavior still holds.
- No automated Playwright exists in this repo (`package.json` has no `playwright` dependency) — the ticket's "verify in Playwright" (AC8) can't be fulfilled by CI here; flagged as a known gap rather than silently skipped.

## Unresolved risks
1. **The real affected prod account's audit (Run 3) hasn't happened.** Need its uid or email to run `scripts/categoryDuplicateAudit.ts` against production read-only and confirm the actual duplicate/missing groups there before closing the "mandatory investigation" gate the ticket requires.
2. **No live duplicate has been merged, archived or repaired.** The render-time dedupe hides them from the picker; the write-time lock stops new ones; the audit's `--plan` output is a report only. Any actual cleanup of the real account's existing duplicates needs its own follow-up ticket and the user's explicit approval, per the ticket's own data-safety rules.
3. **Manual web verification (focus, toast, picker rendering) hasn't been done in this session** — needs the user's own check on local Expo web.
4. **`CategoryManager.tsx`'s add-subcategory input was deliberately left unfocused-on-expand** (see table above) — flagging in case the actual reported screenshot was from this screen rather than the expense-entry picker; if so, a different, narrower fix (e.g. its own explicit "+" toggle) would be needed there.
