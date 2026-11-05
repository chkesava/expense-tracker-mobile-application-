# SPENDLY-586 ADR v2 — Supabase-first reads with app dual writes

| | |
|---|---|
| Story | SPENDLY-587 (epic SPENDLY-586) |
| Status | **v2: the user's decisions are recorded (2026-11-01, plan approved 2026-11-02). The spike passed (2026-11-03). Waiting for the user's sign-off and approval of the rule wording in §6** |
| Replaces | ADR v1 (2026-10-31, "HOLD, then scoped GO/NO-GO"). v1 is in git history at `fe84883d` |
| Plan | `docs/SPENDLY-586-plan.md` v2 (Jira stories 587–601 and 669–674) |
| Predecessor | `docs/SPENDLY-494-adr.md` (the hybrid read model) |
| Pricing verified | 2026-10-31 (supabase.com/pricing, realtime limits, Firestore pricing) |

Evidence grades: **M-prod** = measured in production, **M-local** = measured on local Docker Supabase, **Doc** = vendor documentation, **Code** = the repository, **E** = estimate.

---

## 0. Decisions

| # | Decision | Choice | Who |
|---|---|---|---|
| D7 | Go/no-go | **GO.** The whole app reads from Supabase | **User**, 2026-11-01. v1 recommended HOLD / scoped GO |
| D8 | Write path | **The app writes Supabase directly** as well as Firestore, through `rm_client_apply` (§2) | **User**, 2026-11-01. I recommended a server write-through; the user chose the direct write |
| D1 | Offline | **An on-device SQLite copy** of the user's Supabase rows (§4) | **User** (my recommendation in v2) |
| D3 | Money values | **Exact copies** of Firestore's stored totals; derived numbers from the existing TypeScript helpers over Supabase rows; never SQL | **User** (my recommendation) |
| D2 | Realtime | **A Broadcast ping on a private `user:<uid>` topic, then a refetch.** Not `postgres_changes` | Recommended; **the spike passed** (§3) |
| D4 | Supabase plan | **The Free plan, permanently** (₹0). The user can't take on Pro, 2026-11-04. Safe because the read model is a rebuildable copy: Firestore stays the source of truth, a full sync rebuilds it, and every screen falls back to Firestore. Guardrails in 595 | **User** (2026-11-04) |
| D5 | Success metric | Firestore reads per day (7-day console average): the baseline after the 660/633 releases, measured per step by 600 | Recommended (588) |

**Unchanged from v1:**
- Firestore is the source of truth.
- Every collection has a Firestore fallback and a server-side kill switch.
- Duress, local test and signed-out sessions never touch Supabase.
- Promotion goes shadow → 7 days (14 for money) → supabase, with the user's approval.

---

## 1. Why v2 is different from v1

v1 recommended holding because of offline, realtime, number ownership, the plan, and unmeasured savings. Since then:

| Change | Evidence |
|---|---|
| The per-write push never worked; it was silently rejected at the token check | Fixed by **SPENDLY-662** (`9603d2b3`); in production a save reached Supabase in **5.98 s** (M-prod, 2026-11-01) |
| The biggest read cost was `categories` (62% of a cold launch) | Fixed in Firestore alone by **SPENDLY-660**: 464 → 178 reads per cold launch (M-local lab) |
| The nightly full sync is ~4.1K reads, the 6 AM spike in the console | M-prod. With dual writes it becomes a changed-only safety net (SPENDLY-672) |
| The user wants every write in Supabase at once and every read from Supabase | The user's decision, 2026-11-01 |

---

## 2. D8: the write path (the app writes Supabase)

**Mechanism:**
- `commitMutations` (and every direct writer, SPENDLY-671) hands the written paths to an on-device outbox (SPENDLY-670).
- The outbox reads each document from the **Firestore local cache**: the exact saved version, latency-compensated, 0 billed reads.
- It maps the document with the **shared mapper**, `shared/utils/readModel/mapping.ts`, the same code the server uses.
- It sends batches to **`rm_client_apply`**.

**`rm_client_apply` (SPENDLY-669); the spike prototype is `supabase-readmodel/drills/spike-587/spike.sql`:**
- **`security definer`, not `security invoker`.** This is a spike finding: with an invoker function, the `authenticated` role would need INSERT/UPDATE grants on the tables. As a definer, the tables stay **SELECT-only** for clients, and every rule is enforced inside the function. `set search_path = ''`, `revoke … from public, anon`, `grant execute … to authenticated`.
- **Identity:** `readmodel_auth.uid()`, the same check every read policy uses. It refuses duress, expired, wrong-issuer and wrong-audience tokens.
- **The rules it enforces:**
  - an allowlist of tables;
  - every row must carry the caller's `uid`;
  - shape checks: `doc` is an object, and `client_written_at` is required;
  - deletes become tombstones only.
- **Version guard.** A client row lands only:
  - over no existing row;
  - over an older **client** write (`client_written_at`);
  - over a **server** row whose `source_update_time` is older than the client write.

  Server writers (the push, the sync) don't consult `client_written_at`, so **Firestore's version always wins afterwards**.
- **Nested collections** (watchlist items, SPENDLY-624): the key takes an optional parent id; it lands with 591.

**Consequences:**
- **Two writes can diverge** (one lands, the other doesn't; offline; a crash). The outbox retries durably. The SPENDLY-583/662 **push still runs after every save**, so Firestore's version replaces the client row within seconds. The nightly repair (SPENDLY-672) has Firestore win and **counts divergences**.
- **Device clock skew.** The version guard compares a device time with server times:
  - a device clock running **behind** means its client write is ignored, and Supabase shows the change when the push lands (~6 s);
  - a device clock running **ahead** can briefly overwrite a newer row from another device, until that device's push or the nightly repair restores it.

  Both are bounded by the push. N4's divergence count makes them visible.
- **A modified client** can only write its own rows, only allowlisted tables and only valid shapes, and every such row is overwritten by Firestore's version at the next push or repair. Nothing it writes reaches another user.

**Rollback:** remove the outbox's sender behind a flag (a server setting). Supabase keeps receiving data through the push and the nightly sync, exactly as before v2.

---

## 3. Spike results (2026-11-03, M-local)

**Setup:**
- Local Docker Supabase, with every read-model migration applied (`20261017`–`20261029`).
- The prototype `rm_client_apply` and realtime ping (`supabase-readmodel/drills/spike-587/`).
- Tokens carrying a Firebase ID token's claims (`iss`, `aud`, `sub`, `role: authenticated`, `exp`), signed with the local secret.

**Results: 17 / 17 passed.**

| # | Check | Result |
|---|---|---|
| 1 | A writes its own row through `rm_client_apply` | PASS |
| 2 | A cannot write a row carrying B's uid | PASS ("rows for another user") |
| 3 | A duress token cannot write | PASS ("not allowed") |
| 4 | An expired token cannot write | PASS ("not allowed": refused by `readmodel_auth.uid()` even where the gateway didn't reject it) |
| 5 | A token from another issuer cannot write | PASS |
| 6 | A non-allowlisted table is refused | PASS |
| 7 | A direct table insert is refused (tables SELECT-only) | PASS ("permission denied for table expenses") |
| 8 | The version guard: an older client write never overwrites a newer one | PASS |
| 9 | A newer client write lands | PASS |
| 10 | B cannot read A's rows (RLS) | PASS |
| 11 | A subscribes to its private topic `user:A` | PASS |
| 12 | A receives a ping for its new row | PASS (within the 4 s window) |
| 13 | The ping carries **no document data** (`table`, `doc_id`, `synced_at`, `deleted` only) | PASS |
| 14 | A receives a ping for a **soft delete**: the case `postgres_changes` can't deliver under the owner policy | PASS |
| 15 | After the refetch, the soft-deleted row is gone from A's reads | PASS |
| 16 | B can't join A's topic ("Unauthorized … user:spikeUserA") | PASS |
| 17 | A duress token can't join even its own topic | PASS |

**Not covered by the spike:** Supabase's **third-party verification of a real RS256 Firebase token** on the hosted project, for both PostgREST and Realtime. It is checked when the first collection goes to `shadow`, and the `readmodel-claims` function now logs its rejection reason (SPENDLY-662). Ping latency is measured properly in 593 (target under 2 s).

---

## 4. D1: offline (the on-device SQLite copy)

**Native:** `expo-sqlite`, a native module, so a new build. **Web:** IndexedDB behind the same interface.

**Lifecycle:**
- hydrated on sign-in;
- refreshed by pings and on launch (since the last `synced_at`);
- this device's outbox overlaid, so own saves show at once, offline too.

**Safety:**
- **Wiped** on sign-out and account deletion.
- **Never created in duress.**
- Size cap; history beyond the live window is paged from Supabase online.

**Consequence:** once a collection is on `supabase`, Firestore's cache is no longer its offline source, so 600 can switch off its listener.

---

## 5. D3: number ownership (unchanged rule, new path)

| Value | Shown from |
|---|---|
| Account balance, card total outstanding | Copied `currentBalance` / `currentOutstanding` (592) |
| Card cycle numbers (unbilled, statement due, available credit; SPENDLY-675) | `useCreditCardLiveUsage` over store rows: TypeScript, as today |
| Dashboard month tiles, EPF | Copied `financialSummaries` (592) |
| Net worth | `composeNetWorth` over store rows; there is no authoritative stored document |
| Safe-to-spend, budget progress | Their existing helpers over store rows |

**SQL never computes a displayed number.** A guard test enforces this (592).

---

## 6. Rule changes: proposed wording, for the user's approval

These change project rules, so nothing is edited until the user approves this wording.

### 6.1 `CLAUDE.md`, "Read-model architecture (SPENDLY-494)" paragraph

> **Replace with:**
>
> ## Read-model architecture (SPENDLY-494, SPENDLY-586)
>
> **Firestore** is the source of truth. **Supabase** (`supabase-readmodel/`) is the read model. The app writes every save to both: to Firestore first, and to Supabase through the on-device outbox and the `rm_client_apply` RPC. The server push and the nightly sync then make Supabase match Firestore; **Firestore wins any difference**.
>
> Any feature that writes or reads user data, adds a collection or field, or deletes user data **must follow [docs/READ_MODEL_RULES.md](docs/READ_MODEL_RULES.md)**. In short:
> - **Writes** go through `commitMutations`, or the outbox hook for direct writers. They stamp `createdAt`/`updatedAt`. The app never writes a Supabase table except through `rm_client_apply`.
> - **Reads** go through the per-collection read switch (`firestore` by default), with a Firestore fallback.
> - **Money values** shown from Supabase are copies of Firestore's stored totals or the existing TypeScript helpers over rows. SQL never computes a displayed number.
> - **New synced data** needs a migration, mapping, RLS, the `rm_client_apply` allowlist and the purge.
>
> Operations: `docs/READMODEL_RUNBOOK.md`.

### 6.2 `docs/READ_MODEL_RULES.md`

**R1.1 becomes:**

> Firestore is the source of truth and is written first. The app also writes Supabase, **only** through `rm_client_apply` (security definer: an allowlist, owner, shape, version guard, tombstones), from the on-device outbox. No other client write to Supabase exists: tables are SELECT-only for clients. The server writers are the sync, the push and the purge.

**R4 becomes:**

> Current-state money may be shown from Supabase **only** as copies of Firestore's stored totals (`currentBalance`, `currentOutstanding`, `financialSummaries`), or as the existing TypeScript helpers over rows. SQL never computes a displayed number. Every money collection needs a 14-day zero-difference shadow before it flips.

**R6.2 adds:**

> `rm_client_apply` is the one client-executable write function: `grant execute … to authenticated` only, and covered by `assert_security.sql` and `rls_behaviour.sql`.

---

## 7. Invariants (for every story)

1. Firestore is the source of truth; Firestore wins every difference (push and nightly repair).
2. One mapper (`shared/utils/readModel/mapping.ts`) for the client and the server.
3. Clients write Supabase only through `rm_client_apply`; tables stay SELECT-only.
4. Duress, local test and signed-out sessions never write, read or cache Supabase.
5. No displayed number is computed in SQL; every money value is a copy or a TypeScript helper.
6. A Firestore fallback and a kill switch per collection; promotion only with the user's approval after shadow.
7. Production changes go dry run → report → approval → apply. Migrations are additive.

---

## 8. Sign-off checklist (user)

- [ ] D7 GO, D8 direct dual write, D1 SQLite copy, D3 copies: recorded as the user's decisions.
- [ ] §2 consequences accepted: divergence repaired by the push and nightly, Firestore wins, the clock-skew window.
- [ ] Spike results (§3) accepted; real-token verification is deferred to the first `shadow` flip.
- [ ] **Rule wording §6.1 (`CLAUDE.md`) and §6.2 (`READ_MODEL_RULES.md`) approved as written, or edited.**
- [x] D4: the Free plan (the user, 2026-11-04); guardrails in 595.
