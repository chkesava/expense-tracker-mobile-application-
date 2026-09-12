# KAN-72 — EPF: Security, Audit, Offline Sync & Data Integrity

| | |
|---|---|
| **Jira** | [KAN-72](https://kesavach.atlassian.net/browse/KAN-72) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-72-epf-security-audit` |
| **Date** | 2026-09-12 |

## Why

EPF was functionally complete after KAN-65–71. This ticket asks whether it is
*safe*. Auditing the requirements against the code showed **most were satisfied
incrementally while the module was built** — but three gaps were real, and two
were defects rather than missing paperwork.

This doc is also the single place the EPF security posture is written down; it
was previously spread across six design docs.

---

## The security posture

### Authorization

Every EPF collection lives under `users/{uid}/` and is covered by the recursive
owner grant in `firestore.rules`:

```
match /users/{uid}/{collection}/{document=**} {
  allow read, write: if isOwner(uid) && collection != 'pandalMemberships';
}
```

**No EPF-specific rule block exists, deliberately.** Firestore ORs nested
matches, so a narrower block cannot restrict what the recursive grant already
allows — it would be dead code that reads like a security control. Recorded in
KAN-65 and still true.

All seven collections are covered by ownership tests in
`firestore/personalData.rules.test.ts` — owner allowed, stranger denied:
`epfProfile`, `epfEstablishments`, `epfContributions`, `epfContributionEvents`,
`epfTransfers`, `epfTransferEvents`, `epfInterestEntries`, `epfReconciliations`,
`epfMeta`.

The Netlify cron uses **admin credentials and bypasses rules entirely**, which
is why its collection-group query is scoped to `employmentStatus == "current"`
rather than sweeping every user, and why it is guarded by a constant-time secret
comparison performed *before* any Firestore read.

### Identifier masking — and its honest limit

`maskUan` and `maskIdentifier` (KAN-65) mask UAN, PF member ID and
establishment number in list views, with tap-to-reveal on detail.

**Masking here is shoulder-surfing protection, not a security control.** The
full value is stored in plain text in the user's own owner-scoped document, and
anyone holding the session can read it. That was a deliberate decision in
KAN-65 and is repeated here so it is never over-claimed.

**New in this ticket:** `lib/errors.ts` now redacts `uan`, `memberId` and
`establishmentNumber` from log and error context. Nothing leaked before — this
was verified, not assumed; no EPF code passes an identifier to a logger — but
the guard would not have caught it, and a UAN ties to a real name and full
employment history.

### Idempotency — what guarantees it

| Operation | Guarantee |
|---|---|
| Monthly contribution | Deterministic id `{establishmentId}_{YYYY-MM}` |
| Interest for a year | Deterministic id `{establishmentId}_{financialYear}` |
| Scheduled generation | `batch.create` — throws rather than overwriting a row that appeared since the read |
| Manual history | `canOverwriteWithSimulated` refuses to touch `manualHistorical` or `imported` rows |
| Credit auto-advance | Filters on `status === "expected"`, so a second pass finds nothing |
| Transfer completion | `runTransaction` re-reads and aborts unless still `initiated` |

In every case the guarantee comes from a **key or a re-read**, not from a flag
someone has to remember to check.

### Append-only and compensating patterns

- Transfer reversal writes a **compensating transfer** and a back-pointer; the
  original keeps `completed` because it did happen (KAN-69).
- Establishments are **archived, never deleted** when they have history
  (KAN-65/76), and deletion is refused outright once contributions reference
  them.
- Reconciliations are **append-only observations**; repeated ones accumulate as
  history rather than overwriting (KAN-70).
- Audit events are append-only and written **in the same batch** as the change
  they describe, so a row and its event cannot diverge.

An array on the contribution row was explicitly rejected for the audit trail:
Firestore rewrites arrays wholesale, so a concurrent write can drop entries —
precisely the loss an audit trail exists to prevent.

### Offline behaviour

Every EPF write goes through `commitWrite` from `lib/firestoreWrite.ts`, which
resolves as `"acked"` or `"queued"` after a 1.5s grace and reports "will sync"
through `writeSavedMessage`. Offline writes queue in Firestore's persistent
cache and replay on reconnect; deterministic ids mean a replayed write converges
rather than duplicating.

---

## What this ticket changed

### 1. Log redaction (`lib/errors.ts`)

`SENSITIVE_KEY` gains `\buan\b|memberid|establishmentnumber`. The word boundary
on `uan` keeps it precise — a key like `nuance` is not redacted, and there is a
test asserting exactly that.

App-wide rather than EPF-only, deliberately: the same identifiers could be
logged from anywhere.

### 2. One clock for EPF (`shared/features/epf/utils/epfClock.ts`)

The client used the device timezone; the Netlify cron used **UTC**. At 02:00 IST
on the 1st, UTC still reads the previous month — so the two disagreed about which
month it was.

Nothing was wrong in practice, because the schedule fires at 05:30 UTC = 11:00
IST where both agree. **That is what made it dangerous:** move the schedule, or
run it by hand at the wrong hour, and it silently generates for the wrong month.

`epfTodayKey()` and `epfCurrentMonth()` are IST (`Asia/Kolkata`) and are now
used by **the cron, the client catch-up and every EPF screen** — so the two
sides agree by construction rather than by intention. Hard-coding IST is the
domain's actual timezone: a user in London still has an Indian EPF account with
Indian month boundaries.

### 3. Audit coverage for the money-moving gaps

Status changes, transfers and reconciliations were already audited. Added:

- **Scheduled generation** — `from: "none"` → `to: "expected"`, `actor: "system"`,
  in both the cron and the client catch-up.
- **Contribution saves and edits** — `actor: "user"` for hand-entered months,
  with the previous status as `from`.

`EpfContributionEvent.from` widens to include `"none"`, matching what
`EpfTransferEvent` already did.

**Deliberately not audited:** profile edits and establishment archive/restore.
Neither moves money, both leave a visible state trail, and filling the log with
them makes the financial entries harder to find.

### 4. Two batch-limit bugs the audit writes introduced

Each saved month now writes **two** documents. That broke two batches, and both
would only have failed on a long history — the worst place to find out:

- `useEpfContributions` chunked 400 rows → 800 writes. **Chunk halved to 200.**
- The cron batched a whole establishment at once; someone who recorded one month
  years ago and nothing since could owe hundreds. **Now chunked at 200 months
  per batch.**

---

## Tests

| File | Covers |
|---|---|
| `lib/errors.test.ts` *(extended)* | `uan`, `memberId`, `establishmentNumber` redacted; `nuance` **not** redacted; non-sensitive context survives |
| `shared/features/epf/utils/epfClock.test.ts` *(new)* | The exact UTC/IST disagreement; day rollover; year rollover; the financial-year boundary; agreement during the cron's actual run window |

Full suite: **2203 unit**, **174 rules**, both typechecks clean, both Netlify
bundles verified to load under the CJS runtime.

---

## Requirements closed against existing work

| Requirement | Satisfied by |
|---|---|
| Server-side ownership on every operation | Recursive owner grant + rules tests (KAN-65 onwards) |
| Cross-user access rejected | Same, with explicit stranger-denied cases |
| Idempotent scheduled processing | Deterministic ids (KAN-66/70) |
| Unique keys preventing duplicates | `{establishmentId}_{YYYY-MM}`, `{establishmentId}_{FY}` |
| Transfer retries cannot double-apply | Transaction status guard (KAN-69) |
| Offline edits per Spendly's architecture | `commitWrite` on every write |
| Compensating events over destructive mutation | KAN-65/69/70 |
| Indexes for bounded reads | Every listener index-free; file reconciled with live (KAN-78) |
| Scheduled failures observable and retryable | `epf-cron.yml` fails on non-2xx, per-page logging |

---

## Known limitations

1. **Masking is not encryption.** Identifiers are plain text in the user's own
   document. Changing that would break cross-device sync and any future
   server-side job; it was considered and rejected in KAN-65.
2. **Closed-period transfer overlap is client-guarded only.** It needs a
   collection query, which neither a client transaction nor a security rule can
   express (KAN-69).
3. **No component tests.** `vitest.config.ts` runs only `shared/**`,
   `services/**` and `lib/**`, so the audit trail's *logic* is tested and its
   rendering is not.
4. **The cron's first run after this change** should be checked against its
   summary: it now reports the IST month, and generation writes two documents
   per month instead of one.

## Manual pass

1. Trigger `epf-cron.yml` → summary reports the **IST** month; a second run
   still writes nothing.
2. Generate a month → `epfContributionEvents` has a `system` event with
   `from: "none"`.
3. Save a backfilled month → a `user` event with the previous status as `from`.
4. Back-date a device clock across midnight IST and confirm the EPF screens and
   the cron agree on the current month.
5. Confirm no EPF identifier appears in any log line during normal use.
