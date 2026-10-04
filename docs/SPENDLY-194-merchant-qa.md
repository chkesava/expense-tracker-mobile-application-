# SPENDLY-194: Merchant Intelligence QA, privacy and rollout

**Ticket:** [SPENDLY-194](https://kesavach.atlassian.net/browse/SPENDLY-194)  
**Epic:** [SPENDLY-186](SPENDLY-186-merchant-intelligence.md)  
**Branch:** `feature/SPENDLY-194-merchant-qa`

## QA evidence

`shared/utils/merchantQa.ts` adds a repeatable, privacy-safe synthetic fixture set covering UPI, card, gateway, bank narration, known/unknown merchants, aliases, city variants, look-alikes, person-to-person text, corrections, false positives, and category suggestions. `runMerchantQa()` reports coverage, high-confidence rate, correction count, false-positive rate, unknown rate, category suggestion accuracy, and fragmentation. The fixture output is test evidence only and is not a production accuracy claim.

`merchantInsights` and `merchantGrouping` tests cover duplicate suppression, explicit comparison windows, insufficient-data gates, totals, unknown identity, and deterministic repeatability. Existing full-suite validation is the regression gate.

## Privacy and safety review

- Merchant data is derived from the existing expense/income source text and is never written back to those documents.
- Only user corrections are stored, under the owner-only validated `merchantOverrides` rules covered by the emulator suite.
- No external AI, enrichment provider, remote logo, peer benchmark, or risk score is used.
- QA fixtures contain synthetic merchant strings and identifiers only.
- Error logging uses existing safe error helpers; raw narration is not logged by the QA layer.
- The profile can be disabled or removed without deleting ledger data; correction documents remain independent and recoverable.

## Measured fixture results

Run:

```text
npx vitest run shared/utils/merchantQa.test.ts shared/utils/merchantInsights.test.ts shared/utils/merchantGrouping.test.ts
```

The test asserts repeatability and the presence of unresolved negative cases. The output is intentionally labelled fixture-only. For a release candidate, record the returned metrics in the Jira comment and compare them only with future fixture versions, not production accuracy.

## Performance baseline and limitations

- Resolution is a pure batch operation with a memo cache; it performs no per-row network requests.
- Profile calculations are derived from the already-loaded history and should remain behind the existing screen memoization boundary.
- Large-history validation should be run with the existing 25k-row shared utility performance fixtures and on a low/mid-range Android device before release.
- The current fixture is small and synthetic; it cannot establish production coverage, false-positive rates, or Android frame performance.
- Logo/metadata enrichment is intentionally absent until separately approved.

## Rollout and rollback

1. Run `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`, and `npm run test:rules` before release.
2. Complete the manual device checklist below in Spendly Test/emulator first.
3. Deploy the Firestore rules first, rules only — never indexes — so the new validated `merchantOverrides` collection is available before the app writes it. Then release the app; follow `docs/AFTER_MERGE_CHECKLIST.md` after the epic reaches `main`.
4. Roll back by disabling/removing the merchant profile entry points and resolver consumers. Existing expense/income documents are unchanged; correction documents can remain isolated for a later re-enable.

## Manual Testing Guide

1. Run the fixture command above and confirm it is repeatable with unresolved negative cases.
2. In Spendly Test, verify add/edit transaction, category/subcategory, account/card screens, reports, dashboard, search, recurring flows, and Financial Calendar.
3. Exercise merchant correction, profile navigation, period totals, search, and insights with known, unknown, look-alike, alias, and corrected transactions.
4. Confirm no source transaction gains a merchant field and that another user cannot see corrections.
5. Use a large fixture/history and verify no visible stutter during first load, search, profile navigation, or month/report changes.
6. Repeat the flow on a low/mid-range Android device and record any frame drops or memory pressure.
7. If any privacy, total-reconciliation, duplicate, or regression check fails, stop rollout and use the rollback step above.

**Commands needed:** run the three standard type/test commands, `npm run test:rules` for the existing Firestore rules coverage, and the focused fixture command above. Use `npx expo start` only when the development server is not already running. No production deployment or rules deploy is part of this story.
