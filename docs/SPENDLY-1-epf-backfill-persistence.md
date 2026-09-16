# SPENDLY-1 — why a saved backfill month looked lost

[SPENDLY-1](https://kesavach.atlassian.net/browse/SPENDLY-1) · Bug ·
High / Financial Data Integrity

Read [`EPF.md`](EPF.md) first, then
[`SPENDLY-72-epf-current-lifecycle.md`](SPENDLY-72-epf-current-lifecycle.md) —
this ticket is the other half of that one. This is the decision record for the
second pass.

---

## Why there are two passes

The first pass (`79d5ee8`, 14 Sep) fixed the defect the ticket was opened for:
**Apply** in the month sheet wrote nothing to Firestore, and the establishment
screen swaps tabs with a ternary, so a tab change unmounted the screen and
destroyed every pending edit.

A screen recording on **15 Sep**, against build 87 — which postdates that fix —
showed the flow still broken, differently. That is what this pass addresses. The
symptoms read as data loss and were not:

1. Several months edited in Backfill, all showing **Draft**.
2. **Save all** → *"Saved 1 month — offline, will sync"*.
3. The other months stay **Draft**.
4. Current → Record credit → refused.

## What it actually was

**The months were saved.** `EPF_BATCH_CHUNK_SIZE` is 200, so 39 months are a
single atomic Firestore batch; there was no partial write to find. Three
defects combined to make stored data look lost, and — as with SPENDLY-72 —
fixing any one alone would have left the screen wrong.

**1. Save all could not see the months it had just written.** `applyEdit`
persists every edited month immediately as a `draft` (that is the 14 Sep fix
working). `backfillSaveRows` then skipped every `persisted` row — the SPENDLY-68
guard stopping a bulk wage fill from silently rewriting saved months. So Save
all passed over exactly the months the user had edited and wrote only the one
leftover wage-filled row. Hence "Saved 1 month": a **selection** bug wearing the
costume of a write failure.

**2. A persisted draft was a lifecycle dead end.** `ALLOWED.draft` is `[]`, and
`EpfCreditSheet` hides every action `canTransition` refuses, so Record credit
offered nothing at all. SPENDLY-72's rejection copy says *"Save this month under
Backfill first"* — advice defect 1 made impossible to follow.

**3. A draft counts nowhere.** `BALANCE_BEARING_STATUSES` is
`credited | partial | confirmed`. A persisted draft is excluded from History,
Balance, Current and the portfolio. Stored, invisible, immovable — the ticket's
"months disappear", and the reason the user reasonably concluded nothing had
been written.

A fourth, independent of the above: **the toast lied about durability.** See
below.

---

## Decisions

### The draft escapes through Save all, not through the lifecycle

`ALLOWED.draft` stays `[]`. SPENDLY-72's reasoning is undisturbed: a draft is
not yet a claim about anything, and `draft → credited` would let a row skip the
step that asserts its amounts are real.

Instead `backfillSaveRows` takes the status being written and includes a
persisted row when — and only when — that row is a `draft` and the save is
`confirmed`. The full path is:

```
draft --Save all--> confirmed --Record credit--> credited
```

`confirmed → credited` was already made legal by SPENDLY-72, for this exact
shape of problem. So no transition table changes, and the rejection message that
tells the user to save under Backfill first is now true.

Every other persisted status — `confirmed`, `credited`, `partial`, `missed`,
`reversed` — is still skipped. That is the part SPENDLY-68 cares about, and
`backfillDraft.test.ts` now asserts it across the whole status enum rather than
for the one case that happened to be written down.

The promotion rewrites a document with its own stored amounts, so it is
identical-value and idempotent — deterministic `contributionDocId` plus `merge`.

**`confirmDrafts` was deleted.** It did exactly this job, was exported from
`useEpfContributions`, and no component ever called it. Keeping it would have
left two bulk write paths over one document, which SPENDLY-72 identifies as how
these screens come to disagree in the first place.

### Every month gets its own persistence result

`saveContributions` returned `{ saved, failed }`, where `saved` was incremented
by `group.length` the instant `commitWrite` resolved, and the toast described
the entire operation using only the **last chunk's** outcome. Two lies in one
sentence: queued rows counted as saved, and a save that was part acked and part
queued reported itself as whatever the final chunk did.

It now returns one `EpfMonthSaveResult` per month. A Firestore batch is atomic,
so a chunk's outcome genuinely is every month in it — attributing per month
costs nothing and lets the UI name the months that failed and retry just those.

The fold and the copy live in `shared/features/epf/utils/saveOutcome.ts`, not in
the hook, because `vitest.config.ts` never collects `hooks/**`. "Saved 1 month"
was a string nobody could test; it is now nine assertions.

Partial success is never presented as complete success: any failure sets the
tone to error and leads with the counts, whatever the rest of the batch did.

### "Offline, will sync" was a promise the app could not keep

`commitWrite` returned `"queued"` purely because 1.5 s elapsed with no server
ack. It never checked whether anything durable was behind that queue.

Audit item **KAN-112** found that it usually is not. The Firebase JS SDK's
`persistentLocalCache` is IndexedDB-only; React Native has none, so the SDK logs
*"Falling back to memory cache"* and continues. Verified in the installed bundle
(`@firebase/firestore@4.17.0`). The sharp detail: **that downgrade happens
lazily, inside `ensureOfflineComponents` on first use** — not inside
`initializeFirestore`. So the `try/catch` in `lib/firebase.ts` never fired, and
the recorded cache mode said `persistent-sqlite` for a cache that was memory
only. A force-stop discarded writes the user had been told were safe.

`WriteOutcome` gains a third member, `"unsafe"`: same observable situation as
`queued`, no durable queue behind it. `writeSavedMessage` gives it wording that
does not promise a sync. `FIRESTORE_MESSAGES.unavailable` carried the same false
promise and was corrected too.

Durability is **registered** by `lib/firebase.ts` into `lib/firestoreWrite.ts`
rather than imported from it. `firestoreWrite` is unit-tested under plain Node,
and importing `lib/firebase` would drag `react-native` and the whole Firebase
SDK into that test. Registration happens in `createDb`, which every write path
must reach to get a `db` at all. It defaults to `false` so an unregistered
environment understates durability — the direction of error this ticket exists
to correct.

Backfill additionally warns before a multi-month save that cannot be queued. It
warns rather than blocks: the write still lands if the app stays open, and the
user may well have no better moment.

**This is the honest-UX half only.** The durable outbox stays with KAN-112,
which `services/ganesh/storage/uploadQueue/` is already a good model for.

### The chip says "saved" out loud

A generated row and a saved-but-unconfirmed row both rendered the bare word
**Draft**. That identity is the whole reported confusion: a user who had just
saved eight months saw the same word as before saving. A persisted draft now
reads **Draft · saved**.

---

## Not done

Multi-device conflict resolution, and durable offline replay (KAN-112). Neither
is reachable without the outbox, and both are properties of `commitWrite` rather
than of EPF.

---

## Balance impact

Promoting stuck drafts to `confirmed` makes them balance-bearing, so **reported
EPF balances rise** for anyone holding them. Nothing is deleted or recalculated
— these are months the user typed and believed were already filed.

This is the opposite direction to SPENDLY-72's fall, and both belong in the same
release note.
