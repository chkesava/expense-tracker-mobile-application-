# SPENDLY-653: EPF overview disagreed with Balance after a manual credit

Branch `fix/SPENDLY-653-epf-credit-reconcile`, cut from `main` (standalone bug, no epic).

## Reported figures

| Screen | Total | Contributions | Interest | Transfers |
|---|---|---|---|---|
| Establishment → Balance | ₹50,391.11 | ₹33,520 | ₹148.50 | ₹16,722.61 in |
| Establishment → Current | — | ₹33,520 over 9 credited months | — | — |
| Investments → EPF overview | ₹45,671.11 | ₹22,460 + ₹22,460 = ₹44,920 | ₹751.11 | not shown |

Balance and Current already agreed (₹33,520). The overview was the outlier. Its
total was exactly employee + employer + interest, with **no transfers**. Its
contributions were ₹11,400 **higher** than the ledger and its interest was ₹602.61
higher. The ₹4,720 gap between the two totals is the net of those errors, not
September on its own.

## Root cause

The screens use two different read paths:

- **Balance / Current / History** derive from the source rows
  (`establishmentBalanceBreakdown`, `creditedSplit`).
- **The overview card, net worth and runway** read `users/{uid}/financialSummaries/epf`.
  SPENDLY-429 maintained that document with Firestore `increment()` deltas,
  added inside each EPF writer's batch.

The delta document drifted from the ledger in three ways:

1. **Missing writers.** `applyTransition` handles *mark credited*, *missed*
   and *reversed*. It sent no delta, so a month credited by hand never reached
   the summary. Transfers (`useEpfTransfers`) and the server cron
   (`netlify/functions/epf-cron.ts`) never sent one either, which is why the
   overview had no transfer component.
2. **Non-idempotent deltas.** Each delta was `new − old`, where `old` came
   from a listener snapshot (`byMonth`, `interestEntriesRef`,
   `reconciliationsRef`). Those snapshots lag the hook's own previous write.
   `recomputeInterest` runs from an effect on every contribution change, both
   on the Balance tab and in the dashboard catch-up. Two runs before the
   snapshot caught up applied the same interest delta twice, which explains
   ₹751.11 against ₹148.50. Backfill re-saves had the same flaw for
   contributions.
3. **No single contract.** The SPENDLY-499 rebuild (`calculateEpfSummary`)
   already derives the document from source rows. Between rebuilds, though,
   the client kept incrementing a second, divergent version.

The read model is not involved: `financialSummaries` is not synced to
Supabase. That is correct, because current-state money stays in Firestore.

## Fix: one calculation contract

`epfPortfolioSummary` → `establishmentBalanceBreakdown` is the only
definition. The Balance tab, the rebuild script and the stored document now
all use it.

- `shared/features/epf/utils/summarySync.ts` (pure, tested):
  - `epfSummaryFields(sources)` is the whole stored document, built from
    `calculateEpfSummary`, with `summaryVersion: 2`.
  - `epfSummaryNeedsWrite` compares the stored document with that, to the
    paisa.
  - `decideEpfSummarySync` refuses to write while a source is loading or
    failed (reconciliations now have their own loading flag). It also refuses
    while any source snapshot is cache-only (`metadata.fromCache`), because an
    offline or reconnecting device can hold an incomplete cached collection.
    The EPF listeners use `includeMetadataChanges` (`lib/firestoreSyncState.ts`)
    so the server's confirmation arrives. Metadata-only events flip a flag and
    leave the lists untouched. A server-confirmed empty ledger writes zero.
  - `pendingSummaryWrite` holds back a repeat only while our write is
    outstanding, and releases it once the stored doc shows it. A later stale
    write from another device is then repaired, not ignored.
- `hooks/useEpfSummarySync.ts` is mounted by `EpfDashboard`, which already
  listens to every source through `useEpfInterestCatchUp` (now returned from
  it). It adds one document listener. It writes the **absolute** document
  with `setDoc(..., { merge: true })` only when the stored one differs.
  Retries, re-runs and second devices therefore converge instead of adding.
- `EpfPortfolioCard` renders the live summary, not the stored document, so it
  matches Balance immediately. It also gains a *Net transfers* row, so
  its rows add up to its total.
- **Removed:** every `increment()` writer in `useEpfContributions` (save,
  delete) and `useEpfInterest` (interest recompute, reconciliation), plus
  `shared/utils/epfMutations.ts` and `shared/features/epf/utils/mutations.ts`.
  Mixing increments with absolute writes would race in the offline outbox.

Contribution, transfer, interest and reconciliation documents are written
exactly as before. Only the derived summary changes.

## Expected result for the reported user

The next time the Investments → EPF tab opens online, the stored document is
rewritten from the ledger. The overview then shows the same total as Balance
(₹50,391.11, if this is the only establishment holding money). Net worth and
runway pick it up from the same document. No migration or backfill was run.

## Not changed / leftovers

- **September's ₹4,720.** `creditedSplit` scales the stored employee and
  employer EPF shares by `creditedAmount / epfCredit`. The Current tab's
  ₹1,800 + ₹1,800 are the projected *employee* and *employer total* shares; the
  employer total includes EPS, which never reaches the balance. Whether ₹4,720
  was the right amount to enter for that month is a data question for the user.
  The calculation was not changed.
- **Cron and transfer writes away from the EPF tab.** These still don't
  refresh the stored document until the EPF tab is next opened. Before this
  fix they never did. A server-side recompute in `epf-cron` would close the gap
  (follow-up ticket if wanted).
- **`useEpfNetWorth`** still reads the stored document. It carries stale
  unused imports from KAN-71; these were left untouched to keep this diff small.

## Tests

- `shared/features/epf/utils/summarySync.test.ts` (14 tests):
  - the summary equals the Balance total, including transfers;
  - a manual credit's split sums to the credited amount;
  - marking a month credited moves the summary;
  - same sources give the same document (idempotent retry);
  - a stale increment-built document is repaired;
  - a missing field or old version triggers a rewrite;
  - no write while loading or failed;
  - no write in sync (reload converges);
  - empty-source zeroing is refused, and a genuine drop to zero is still written.

## Review follow-up (CodeRabbit, PR #247)

All five comments were valid and fixed:
- write only from server-confirmed snapshots;
- direction-neutral "Net transfers" label;
- reconciliations loading flag;
- pending-write suppression released on confirmation;
- confirmed-empty ledger writes zero.
