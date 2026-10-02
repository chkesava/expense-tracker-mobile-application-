# SPENDLY-207: Liquid resource and cash availability classification

**Ticket:** [SPENDLY-207](https://kesavach.atlassian.net/browse/SPENDLY-207) (Story)
**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204). See the [epic record](SPENDLY-204-financial-runway.md).
**Branch:** `feature/SPENDLY-207-liquidity-classification`, cut from the epic branch after 205.
**Depends on:** SPENDLY-205, which provides the contract and default rules.

---

## 1. What users see
- **Runway sources** (`/runway/sources`) lists every resource Spendly knows about in three groups:
  - **Counted:** spendable money runway starts from.
  - **Not counted:** near-liquid, locked or long-term, not yet received, or of an unrecognised type.
  - **You owe:** credit cards and loans.

  Each row shows:
  - the name and kind;
  - the amount;
  - its liquidity label;
  - a plain sentence explaining why it is or isn't counted;
  - a **switch** where the user may change it, or a lock where they can't.

  A summary at the top shows the counted total. It says that runway is a planning estimate and that these choices don't change balances or net worth.
- **Account detail:** non-card accounts get a one-line **Financial runway** row ("Counted toward runway" or "Not counted…", plus the reason) that opens Runway sources.

## 2. Override rules
These are product decisions made on 2026-10-02.

| Kind | Default | Override allowed |
|---|---|---|
| Bank, cash, wallet | Counted | Can be **excluded**, for example a joint or someone else's account |
| Unrecognised account type | Not counted | Can be **included** once the user confirms it's spendable |
| FD, interest savings, mutual fund, demat cash | Not counted (near-liquid) | Can be **included** |
| EPF, stocks | Not counted (restricted) | **Locked** |
| Money owed to you | Not counted (not yet received) | **Locked** |
| Credit cards, loans | Obligations | **Locked**: never a resource |

**What an override can't do:**
- Count an account in another currency. The switch is disabled and the reason is shown.
- Count a locked kind. The client ignores such an override, and Firestore rejects it.

**Storing and resetting:** setting a resource back to its default deletes the override, so no stale row stays behind.

## 3. Data
- **`users/{uid}/runwayOverrides/{kind__refId}`** stores `{ kind, refId, included, updatedAtMs }`.
  - One document per resource. It's scoped to duress mode, like the finance data, and not stored on the settings document, which always uses the real uid.
  - Writes go through `commitMutations` (offline outbox). They never touch an account, investment or ledger row.
- **Rules (`runwayOverrideWellFormed`):**
  - owner and duress twin only;
  - `keys().hasOnly` with exactly those four fields;
  - `kind` limited to the overridable list;
  - `refId` is a non-empty string of at most 128 characters;
  - **the id must equal `kind + '__' + refId`**, which pins both and allows one override per resource;
  - `included` is a bool and `updatedAtMs` is a number.

  It's a validated collection and stays off the catch-all list.
- The listener (`useRunwayOverrides`) mounts only on the sources screen and the account row. There's no shell listener.

## 4. Reconciliation
`buildRunwaySources` (`shared/utils/runwaySources.ts`) takes the same inputs as `composeNetWorth` and uses the same source functions:

| Resource | Source function or figure |
|---|---|
| Bank balances | `computeBankBalance` (with `today` in the user's timezone) |
| Card dues | `computeOutstandingCredit` |
| Investments (active or matured) | `getInvestmentValuation` |
| Demat cash and stocks | Net-worth formula |
| EPF, receivables, borrowings | Net-worth totals |

A test proves that each group's sum equals the matching net-worth figure. `netWorth.ts` is unchanged.

**Provenance certainty:**
- **actual:** balances, demat cash, loans.
- **estimated:** investment valuations, stocks, and EPF with unreconciled months.
- **expected:** money owed to you.

## 5. Acceptance criteria
| Criterion | Where |
|---|---|
| Classification is visible and explainable | Sources screen and the account row, with reason text from `RUNWAY_ASSUMPTIONS` |
| Included balances reconcile with source accounts | "matches the net-worth figures…" and "reconciles with their balances" tests |
| Credit-card liabilities are not counted as assets | Obligations group; locked in the client and in the rules; tests |
| Restricted assets can't silently inflate runway | EPF and stocks are locked; the rules reject their kinds; emulator tests |
| Account changes update runway appropriately | The sources are recomputed from live data; "reflects account changes" test |
| Unknown account types fall back safely | `other_account` → unknown → excluded, opt-in only |
| Existing net-worth calculations unchanged | `netWorth.ts` is untouched, and its tests pass unchanged |

## 6. Files
| File | What |
|---|---|
| `shared/utils/runwaySources.ts` (+test) | Collects and classifies every source |
| `shared/utils/runwayContract.ts` | Override support, `isOverridableKind`, `runwayOverrideId` |
| `shared/data/runwayRules.ts` | `RUNWAY_OVERRIDABLE_KINDS` and the user-choice reason texts |
| `shared/types/runway.ts` | `RunwayOverride`; `overridable` added to `RunwayResource` |
| `shared/utils/runwayLabels.ts` (+test) | Labels, reason text, switch and default helpers |
| `shared/utils/runwayOverride.rules.contract.test.ts` | TS ↔ rules allowlist, kinds and id pin |
| `services/runway/runwayOverrideStore.ts` | Set and reset an override |
| `hooks/useRunwayOverrides.ts`, `hooks/useRunwaySources.ts` | Listener and the gathered sources |
| `components/runway/RunwaySourceRow.tsx`, `AccountRunwayRow.tsx` | The source row and the account detail row |
| `app/(app)/runway/sources.tsx` | The sources screen |
| `firestore.rules`, `firestore/runwayOverrides.rules.test.ts` | Rules and emulator tests |
| `app/(app)/_layout.tsx`, `navigation.ts`, `routeRestoration.ts` (+tests) | Route registration, Android back, restore |
| `app/(app)/accounts/[id].tsx` | Adds the runway row |

## 7. Rollout
Deploy the Firestore rules (**rules only, no indexes**) before the app release. Otherwise the sources screen shows a permission error.

## 8. Manual testing guide
Use Spendly Test on the emulator.
1. Open a bank account. Its row should say **Counted toward runway**. Tap it to open Runway sources.
2. Switch an FD on and check the counted total rises by its value. Switch it off again: the override document is deleted.
3. EPF, stocks, cards, loans and receivables show a lock.
4. Exclude a bank account and check that the account detail row now says **Not counted**, and that the net worth on the dashboard is unchanged.
5. Go offline and toggle. The toast should say it will sync.
