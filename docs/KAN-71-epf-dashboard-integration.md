# KAN-71 — EPF: Dashboard & Investment UI Integration

| | |
|---|---|
| **Jira** | [KAN-71](https://kesavach.atlassian.net/browse/KAN-71) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF, and the dashboard |
| **Branch** | `feat/KAN-71-epf-dashboard-integration` |
| **Date** | 2026-09-12 |
| **Builds on** | KAN-65 · 66 · 67 · 68 · [69](./KAN-69-epf-transfers.md) · [70](./KAN-70-epf-interest-reconciliation.md) |

## Why

EPF was functionally complete but **invisible outside its own tab**.
`useUnifiedNetWorth` had no idea it existed, so someone with ten years of
service saw a net worth understated by lakhs. And inside the EPF tab there was
no total — everything was per-establishment, so three employers meant three
numbers and no sum.

## Most of this ticket was already built

Like KAN-68, the description largely restates shipped work. These were **closed
against, not rebuilt**:

| Requirement | Delivered by |
|---|---|
| EPF entry point under Investments | KAN-65 — the `epf` hub tab |
| Current + previous establishments distinguishable | KAN-65 |
| Recent months with every state | KAN-68 — Current tab |
| Expected credit window separate from month | KAN-67/68 |
| History with financial-year grouping | KAN-66 — History tab |
| Interest by FY + reconciliation variance | KAN-70 — Balance tab |
| Transfer history with source/destination/status | KAN-69 — Transfers tab |
| Simulated / Manual / Reconciled labelling | KAN-68/69/70 `*StatusMeta` helpers |
| Setup and edit flows | KAN-65/66/69/70 |
| Confirmation before adjustments and transfers | KAN-69/70 via `appDialog` |
| Loading, empty, error states | throughout |

**Delivered here:** net-worth integration, a UAN-level total with the
contribution-type breakdown, and the live dashboard surfaces.

## Decisions

| Decision | Outcome |
|---|---|
| Does EPF count toward net worth? | **Yes, labelled as partly simulated.** Excluding a major asset is more misleading than including a projection that says it is one |
| Where does the UAN total live? | **A card at the top of the EPF tab**, so the establishment list reads as its breakdown |

## The real problem: contributions are per-establishment

`useEpfContributions(establishmentId)` filters to one employer, and React
forbids looping hooks — so nothing could sum across employers.

**`hooks/useEpfAllContributions.ts`** is a read-only, unfiltered listener. A
working lifetime produces a few hundred rows (20 years ≈ 240), so no filter
means no index and no deploy dependency. The per-establishment hook is untouched:
it owns the writes, and the route only ever cares about one employer.

## Keeping the dashboard cheap

Naively this mounts **five new Firestore listeners for every Spendly user** —
including the large majority with no EPF. That is a real cold-start cost and the
opposite of the bounded loading the ticket asks for.

`hooks/useEpfNetWorth.ts` reads the **profile document first** and mounts the
rest only if one exists:

```
no EPF profile  → one small doc listener, nothing else, epfValue = 0
has EPF profile → establishments + contributions + transfers + interest + reconciliations
```

A read failure on that gate is treated as "no EPF" rather than breaking net
worth for everyone — the EPF tab surfaces the real error.

## The aggregate

`shared/features/epf/utils/portfolio.ts` sums
`establishmentBalanceBreakdown` — KAN-69's settled definition, extended in
KAN-70 — across every establishment. **No new arithmetic**; re-deriving a
balance here would have been the third competing version of the same number.

Two details worth keeping:

- **Archived establishments are included.** Archiving hides an employer from the
  working list; it does not delete its money.
- **EPS is reported but excluded from the total.** It is pension, held separately
  by EPFO, and conflating it with the fund is exactly the error KAN-66
  introduced `epfCredit` to prevent. A test asserts
  `employeeShare + employerEpfShare === total`, with EPS nowhere in it.

A reconciled month whose actual differs from the projection has its
employee/employer split **scaled proportionally**, so the parts still sum to
what really landed.

## Files

| File | Change |
|---|---|
| `shared/features/epf/utils/portfolio.ts` | The aggregate (new) |
| `hooks/useEpfAllContributions.ts` | Unfiltered read-only listener (new) |
| `hooks/useEpfNetWorth.ts` | Profile-gated aggregate (new) |
| `hooks/useUnifiedNetWorth.ts` | `epfValue` + `epfUnreconciledCount`, into `totalAssets` |
| `components/dashboard/NetWorthWidget.tsx` | EPF row, labelled "EPF · simulated" while unconfirmed |
| `components/accounts/AccountsList.tsx` | Fourth breakdown cell, shown only when EPF exists |
| `components/epf/EpfPortfolioCard.tsx` | The UAN total (new) |

`components/dashboard/InvestmentsWidget.tsx` is **deliberately untouched**: it is
dead code — nothing imports it, and `"investments"` sits in `SKIP_WIDGETS`.
Editing it would have looked like integration while changing nothing a user
sees.

### Layout note

`AccountsList`'s breakdown row was a fixed 3-across at `flex: 1`; a fourth cell
would have squeezed every label to a quarter width. It now wraps
(`flexWrap` + `flexBasis: 22%` + `minWidth`), so four cells become two rows on a
narrow phone instead of squashing.

The EPF cell is shown **only when `epfValue > 0`**, so the screen is unchanged
for users without EPF. Its "simulated" framing lives on the net-worth widget and
the EPF tab, where a 10px centred label has room to say it.

## Tests

| File | Count |
|---|---|
| `shared/features/epf/utils/portfolio.test.ts` | 13 |

Full suite: **2193 unit**, **174 rules**, both typechecks clean.

**What could not be tested.** The ticket asks for "automated UI/integration
tests covering primary navigation, dashboard totals and establishment
switching". `vitest.config.ts` runs only `shared/**`, `services/**` and `lib/**`
— there is no component test runner in this repo, and adding one is out of
scope for this ticket. The aggregation has full coverage; the widgets have none.
Stated plainly rather than implied otherwise.

## Known limitations

1. **This puts an unverified EPF figure on every user's dashboard.** Eight EPF
   tickets have merged and none has been opened on a device. Until now the blast
   radius was the EPF tab; it is now the headline net-worth number.
2. **Five extra listeners for EPF users** — gated on the profile, but worth
   confirming cold-start latency on a real device for someone who does use EPF.
3. **The EPF components still use a local `money` helper** rather than `Amount`,
   so ghost mode does not apply inside the EPF tab's older cards. The new
   portfolio card uses `Amount` correctly; retrofitting the rest is a small
   follow-up, not silently done here.

## Manual testing guide

1. **No EPF profile** → dashboard net worth unchanged, no EPF row, no added load
   time; Accounts breakdown still three cells.
2. **EPF set up with recorded months** → an **EPF** row appears in the net-worth
   breakdown, and total assets rise by exactly the EPF balance.
3. The row reads **"EPF · simulated"** while anything is unconfirmed; reconcile
   everything and it reads "EPF".
4. EPF tab → the total card sums every employer, archived included, and matches
   the sum of the per-establishment Balance tabs.
5. **Pension (EPS) appears separately**, explicitly outside the balance —
   your contributions + employer's + interest equals the total without it.
6. Accounts screen → four cells **wrap to two rows** on a narrow phone rather
   than squashing.
7. **Ghost mode** hides the EPF total on the portfolio card and the dashboard
   row.
8. Repeat on Web.
