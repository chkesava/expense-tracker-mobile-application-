# SPENDLY-639 — Offline, outbox and freshness integrity on the native SDK

Epic: SPENDLY-633. Branch: `feature/SPENDLY-639-offline-integrity`.

## The risk
`commitMutations` journals every write to an AsyncStorage outbox and replays
it on the next launch; non-idempotent batches (increment / arrayUnion /
ledgerEvents) first look for their `meta/outboxAck_{id}` doc. That was right
when the JS SDK lost its queue on a force-stop. Since SPENDLY-638 the native
SDK keeps its own durable queue, so an offline write would exist **twice**
after a restart — in the native queue and in the outbox. If the ack lookup
read the server before the native queue flushed, the replay would apply an
increment (a balance) a second time.

## Change
- **Journal only when the SDK's own queue is not durable**
  (`outboxPersistEnabled` → `!isWriteQueueDurable()`). Web (IndexedDB) and
  native (native SDK) both report durable, so neither journals; a JS-SDK
  memory fallback still does.
- **Replay still drains entries already on the device**, whatever this build
  journals: offline writes queued by an older JS-SDK build exist only in the
  outbox and must land once after the upgrade. The ack check still guards
  non-idempotent ones.
- Tests (`lib/commitMutations.test.ts`, +4): no journal with a durable queue;
  journal with a memory-only queue; an offline increment can't be re-applied
  on restart; an older build's leftover entry drains exactly once.

## Reviewed, no change needed
- `fromCache` on cold start is now common (persistent cache).
  `isStagedPageComplete` never calls a cached page complete; the four
  "verify linked rows before delete" guards (spaces, trips, borrowings,
  receivables, finance) correctly refuse while answered from cache;
  `noteServerSync` only stamps server snapshots, so "last synced" stays true.

## Device check (Spendly Test, CPH2661, emulator) — SPENDLY-638 check 4
Server state read from the emulator before/after:

| Step | Expenses | HDFC Savings |
|---|---|---|
| Baseline | 129 | 4,63,615 |
| ₹639 saved while still connected | 130 | 4,62,976 |
| Cold start offline → ₹31 saved → force-stop (server) | 130 | 4,62,976 (not sent) |
| Reconnect + relaunch | **131** | **4,62,945** |
| Another relaunch | 131 | 4,62,945 (no replay) |

The offline expense — including its balance `increment` — landed exactly
once. The offline cold start also showed the up-to-date cached balance.

Note: `adb reverse --remove-all` does not cut already-open connections; a
true offline test needs the app force-stopped after removing the forwards.

## Checks
- `npm test`: 491 files / 6496 tests passed.
- `npm run typecheck:shared`, `npm run typecheck`: clean.
