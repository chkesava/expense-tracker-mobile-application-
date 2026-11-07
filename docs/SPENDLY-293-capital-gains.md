# SPENDLY-293: Capital gains lots and classification

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md)).

**Branch:** `feature/SPENDLY-293-capital-gains`, from the epic branch.

## What the user sees

**Tax center → Capital gains (`/tax/{fy}/capital-gains`)**
- **Year:** named through `taxYearLabel`.
- **Totals:** short-term gains and long-term gains across all asset types. A total shows "Unknown" when any counted sale's cost is unknown; it is never a guess.
- **By asset type** (listed shares and ETFs, equity funds, debt funds, gold, property and others): the short- and long-term gain, then:
  - the user's **statement totals**;
  - the user's own **sales**;
  - the **sales Spendly found** in the portfolio, marked "Calculated by Spendly".
- **A sale Spendly found** (tap it):
  - **from your trades:** quantity, bought on, cost, sale value and selling charges, per lot;
  - **worked out by Spendly:** how long it was held, the term and the gain;
  - **why it may need a look:** see the flags below;
  - **actions:** count this sale, leave it out, change the asset type, undo.
- **Notices:** sales not counted yet, counted sales with an unknown cost, sales without a term, and possible duplicates.
- **Actions:** add a sale and add a statement total (both editable and soft-deleted, with proofs attached from Documents).
- **States:** empty, loading, error and offline.

Nothing here works out tax, rates, exemptions or indexation; SPENDLY-295 owns the estimate.

## Rules

**Source data.** The portfolio's `portfolioTransactions` and `holdings`, read only, plus the year's `taxEntries` of kind `capital_gain` and `taxReviews`. Only `executed` orders count (not pending or cancelled). SIP positions are virtual and have no sells, so they don't appear.

**Lots (`shared/features/tax/utils/capitalGains.ts`)**
- **Order:** first in, first out per instrument (portfolio profile + symbol), over the whole trade history. Earlier years' sales use up their lots.
- **Charges:** a buy's charges are part of its cost. A sale's charges are its transfer expenses, shared across the lots it uses by quantity.
- **Missing history is never filled in.** A sale beyond the recorded buys has an unknown cost for the uncovered part. A sale after a SPLIT, BONUS or ADJUSTMENT row (a cost-basis correction) has an unknown cost too, because Spendly can't trace how those changed it. An unknown cost gives an unknown gain, and an unknown total.
- **Same order every time:** the result doesn't depend on the order rows arrive in (tested).

**Asset type.** Taken from the holding's instrument type:

| Instrument type | Asset type |
|---|---|
| stock, ETF | listed shares |
| mutual fund | equity fund, flagged "check the asset type" (it may be a debt fund) |
| gold | gold |
| crypto | virtual digital asset (unsupported) |
| unknown | listed shares, flagged |

The user can change it per sale (`recategorize`, stored as the asset type).

**Term (`data/capitalGainRules.ts`).** Long-term only when held for *more than* the threshold, using the rule in force on the sale date (Income-tax Act 1961 s.2(42A), amended by the Finance (No. 2) Act 2024; sources in the file):

| Asset | Sold before 23 Jul 2024 | Sold from 23 Jul 2024 |
|---|---|---|
| Listed shares, equity funds | 12 months | 12 months |
| Property | 24 months | 24 months |
| Debt funds, gold, other | 36 months | 24 months |
| Virtual digital assets | unsupported | unsupported |

- **s.50AA:** debt-fund units bought on or after 1 April 2023 are short-term whatever the holding period.
- **Unknown buy date:** the term is unknown.
- **Changing a rule** needs a new rule id, a test and an update to this doc.

**Flags (shown, never fixed silently)**
- No recorded buy covers the sale.
- A split, bonus or adjustment came before the sale.
- Spendly guessed the asset type.
- Listed shares bought before 1 Feb 2018: grandfathering may apply.
- Bought and sold the same day: intraday trading isn't a capital gain.

**Counting**
- **Spendly's sales** are calculated, so they count only once the user confirms them (the portfolio may hold practice trades).
- **Review:** `taxReviews/{fy}__portfolio_transaction__{sellId}`, with `sourceAmount` = the sale value. If the trade later changes, the sale shows "The trade changed: check again" and stops counting.
- **Statement totals:** a broker or registrar total (`mode: "statement_total"`, with a `term`) replaces Spendly's sales of that asset type (D7). The user's own sales of that type still count beside it.
- **The user's own sales** (`mode: "row"`) count as entered. Their term is worked out from their dates, never stored.

**Model change.** A `statement_total` now has a required `term` (`short_term` / `long_term`); a `row` may not have one. This is enforced in validation and in `firestore.rules` (`taxCapitalGainFields`). The duplicate key for a total is asset type + term. No data exists yet (nothing is deployed), so no backfill is needed.

## Read model (READ_MODEL_RULES)

- **No new collection or field in Supabase.** `term` lives inside `fields`, which `tax_entries` already stores as JSON (SPENDLY-709).
- **Reads:** trades and holdings go through `useReadModelSource("portfolioTransactions")` and `useReadModelSource("holdings")` (`hooks/useTaxCapitalGains.ts`), with no Firestore listener in `supabase` mode. Both collections were already switched (SPENDLY-598).
- **Writes:** the review goes through `commitMutations` (`taxStore.saveTaxReview`).
- **R4.3a:** before writing, `taxCapitalGainStore` re-reads the SELL row from Firestore. If it's gone, not executed, in another year, or worth a different amount, nothing is written and the user is asked to look again.

## Form

The generic form (`ENTRY_FORMS.capital_gain`, plus `CAPITAL_GAIN_TOTAL_FORM`) gained:
- a `quantity` field type (decimal, up to 8 places, commas allowed);
- a `dateRange: "beforeYearEnd"` option, so a buy date can be years earlier.

`entryFormSpecFor` opens an entry in the form it was made with.

## Demo data (local test only)

The year that ended last gets:
- **INFY** (holding 25 @ ₹1,480): buys of 20 @ ₹1,300 two years before and 20 @ ₹1,525, then a sale of 15 → long-term.
- **NIFTYBEES** (holding 150 @ ₹238): a buy of 200 and a sale of 50 eight months later → short-term.
- **TATAMOTORS:** a sale with no recorded buy → cost unknown.
- **Gold coins** the user added → long-term.
- **A CAMS long-term statement total** for equity funds.

What's left after the sales matches each holding (tested).

## Tests

| File | Covers |
|---|---|
| `capitalGains.test.ts` | Month arithmetic; rule choice around 23 Jul 2024; "more than" threshold; gold 36→24 months; s.50AA; VDA unsupported; asset type mapping; FIFO across lots; pending/cancelled ignored; profiles apart; order-independent; adjustment/split and intraday flags; cost, charges, term and gain per lot; nothing counted until confirmed; changed sale re-opened; excluded; recategorized (with s.50AA); unknown cost propagates; grandfathering; year boundary with earlier sales consuming lots; user rows; statement total replaces Spendly's rows of its class; deleted entries and other years' reviews ignored; overall totals |
| `capitalGainForms.test.ts` | Sale form (buy date before the year, ISIN cleaned, empty cost → unknown, no term); quantity parsing; statement total requires a term; entries reopen in their own form; list and status wording |
| `validation.test.ts`, `dedupe.test.ts` | Term required on totals, refused on rows; total duplicate key |
| `taxCapitalGainStore.test.ts` | Review written with Firestore's sale value; asset type stored on recategorize; nothing written when the sale changed, was cancelled, moved year, isn't a sale or is gone; undo |
| `firestore/tax.rules.test.ts` | Term accepted on a total, required there, refused on a row or with another value |
| `lib/localTestMode.test.ts` | Seeded tax entries are valid with correct duplicate keys; seeded sales trace to the expected terms; holdings match their trades |
| navigation and route-restoration tests | `/tax/{fy}/capital-gains` |
