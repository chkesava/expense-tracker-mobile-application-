# KAN-75 — EPF: Firestore Index & Query Performance Review

| | |
|---|---|
| **Jira** | [KAN-75](https://kesavach.atlassian.net/browse/KAN-75) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-75-epf-index-query-review` |
| **Date** | 2026-09-12 |
| **Covers** | KAN-65 · 66 · 67 · 68 · 69 · 70 · 71 · 72 |

## Why this ticket existed

KAN-65 deliberately added **no** index, on the reasoning that indexes are only
knowable once the real query shapes exist. This ticket was filed so the review
would not be lost between tickets.

Deferring was right — but not for the expected reason. **Every index the
original ticket predicted turned out to be unnecessary**, because each
subsequent ticket independently chose a design that avoids composite indexes.

## The audit

Every Firestore read in the EPF module, enumerated from the code:

| # | Where | Query | Index |
|---|---|---|---|
| 1 | `useEpf.ts:120` | `epfProfile/main` — single doc | none |
| 2 | `useEpf.ts:162` | `epfEstablishments` — unfiltered | none |
| 3 | `useEpf.ts:495` | `epfContributions` `where(establishmentId ==)` + `limit(1)` | none — equality only |
| 4 | `useEpfAllContributions.ts:48` | `epfContributions` — unfiltered | none |
| 5 | `useEpfContributions.ts:120` | `epfContributions` `where(establishmentId ==)` | none — equality only |
| 6 | `useEpfInterest.ts:93` | `epfInterestEntries` — unfiltered | none |
| 7 | `useEpfInterest.ts:115` | `epfReconciliations` — unfiltered | none |
| 8 | `useEpfNetWorth.ts:55` | `epfProfile/main` — single doc | none |
| 9 | `useEpfTransfers.ts:90` | `epfTransfers` — unfiltered | none |
| 10 | `epf-cron.ts:169` | `collectionGroup(epfEstablishments)` `.where(employmentStatus ==)` `.orderBy(__name__)` | **collection-group single-field override — deployed in KAN-78** |
| 11 | `epf-cron.ts:197` | `users/{uid}/epfEstablishments` — unfiltered | none |
| 12 | `epf-cron.ts:207` | `epfContributions` `where(establishmentId ==)` | none — equality only |

**No composite index is required anywhere in EPF.** The single index that exists
is already live, and a successful cron run proved it.

### Why every predicted index was superseded

Recorded so a future reader does not "re-add the missing index":

| Predicted in KAN-75 | What actually happened |
|---|---|
| `epfContributions: establishmentId ASC + month DESC` | KAN-66 dropped the `orderBy` and sorts client-side |
| contributions by `status` + month window | Never built — the lifecycle filters in memory |
| transfers by establishment | Unfiltered listener, filtered in memory |
| interest by financial year | Unfiltered listener |

The pattern is the finding: **in-memory sorting over a bounded collection beat
an index in every case here.** These collections are small, and an `orderBy` on
a data field carries a real hazard — Firestore silently omits documents missing
the ordered field, which for financial history means quietly losing a month.

> **This conclusion has teeth.** It is "no index is needed *for the queries that
> exist today*", not "EPF never needs indexes". Any future `orderBy` on a data
> field will need one, and will fail at **runtime**, not at build. Re-run this
> audit when adding a query.

### No query can silently drop documents

No EPF query orders by a data field. The only `orderBy` is `__name__` in the
cron, which every document has by definition. The hazard KAN-65 designed around
cannot occur anywhere in the module.

## Live state verified

Checked read-only against the project rather than assumed:

```
live composite: 15 | file composite: 15
in live but NOT in file (a deploy would DELETE): (none)
in file but NOT live (a deploy would CREATE): (none)
live fieldOverrides: 1
  - epfEstablishments.employmentStatus ["COLLECTION","COLLECTION_GROUP"]
```

`firestore.indexes.json` needs **no change**, so **no index deploy is required**
— which also means this ticket cannot break production, unlike KAN-78.

> **Keep the file a superset of live.** KAN-78 found six live indexes missing
> from the file; a sibling Vite repo shares this Firebase project, and
> `firebase deploy --only firestore:indexes` deletes anything absent from the
> file. **Always diff before deploying indexes.**

## Corrections made

### `epfMeta` did not exist

It was listed in the `firestore.rules` inventory comment — which claims to list
"collections currently written by the app" — and in the rules-test `collections`
array. **Nothing wrote it.** It was planned in KAN-67 as a scheduler stamp and
then made unnecessary by deterministic ids; the references were left behind.

Removed from both. Both now list exactly the eight collections the app writes:

```
epfProfile · epfEstablishments · epfContributions · epfContributionEvents
epfTransfers · epfTransferEvents · epfInterestEntries · epfReconciliations
```

## Performance characteristics — documented, not changed

### The cron reads twice per EPF user per run

For each establishment in a page it fetches siblings and contributions
separately — strictly an N+1 shape. Acceptable because:

- KAN-65 permits only **one** current establishment per user, so the
  collection-group query returns at most one document per user; the sibling
  fetch is never repeated within a user.
- It runs monthly, and the page is bounded at 25 (max 100).

Unavoidable without denormalising. Recorded so it is not later mistaken for an
oversight.

### The dashboard streams a user's whole EPF history

`useEpfNetWorth` mounts five listeners to compute one number. For a 30-year
career with four employers that is roughly **400 documents** — ~360
contributions plus interest entries, transfers and establishments — on every
dashboard visit.

Mitigating: the profile gate means non-EPF users pay nothing, and Firestore's
persistent cache plus listener resume tokens mean repeat visits do not re-read
everything from the server.

**Not fixed here, deliberately.** KAN-75 is a review ticket; turning it into a
performance refactor mid-audit is how audits stop being trustworthy. The fix —
deriving balance from each interest entry's stored `closingBalance` plus only
the months since the last closed financial year, cutting ~400 documents to
roughly 20 — makes the dashboard depend on interest entries being fresh, and a
stale entry would silently understate a balance. That needs its own ticket and
its own tests: [KAN-121](https://kesavach.atlassian.net/browse/KAN-121).

Nobody has a 30-year history in this app yet, so this is real but not urgent.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Every EPF query backed by an index or documented as not needing one | Done — table above |
| `firestore.indexes.json` has the indexes used and no speculative ones | Done — no change needed |
| No unbounded or N+1 reads remain unexamined | Both found, measured and documented; one has a follow-up |
| `firestore.rules` inventory lists every EPF collection written | Done — `epfMeta` removed |
| Rules tests cover ownership for every EPF collection | Done — 8 collections |
| Indexes deployed and verified against the real project | Verified; no deploy required |
| A note in `docs/` recording which queries need which index and why | This document |

## Verification

```bash
npm test                          # unchanged
npm run typecheck                 # and typecheck:shared
npm run test:rules                # 8 EPF collections
npx firebase firestore:indexes    # read-only diff against the file
```

No manual pass required — this ticket changes no runtime behaviour. The EPF
screens and the cron are untouched.
