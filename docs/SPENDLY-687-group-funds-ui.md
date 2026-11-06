# SPENDLY-687: Group Funds S5, Money hub section, screens and sheets

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md`).

**Branch:** `feature/SPENDLY-687-group-funds-ui`, cut from the epic branch.

## Where it lives
- **Money hub:** a new section, "Group funds", in a new group, "Held for others", at `/ledger?tab=groupFunds`. It is wired through `LEDGER_HUB_TAB_IDS`, `LEDGER_GROUPS`, `LEDGER_SECTIONS`, the section icon and `LedgerTab`.
- **Detail screen:** `/group-funds/[id]`, registered in `app/(app)/_layout.tsx`, `SUB_SCREEN_PREFIXES` (Android back pops it) and `RESTORABLE_ROUTES`, with tests.
- **Dashboard:** the "Held for others" card (from S4) now opens the hub section.

## Screens and sheets (`components/groupFunds/`)
- **`GroupFundsList`** (the hub section):
  - A "Held for others" hero, the total of the active funds' stored `held`. It says the money is inside the account balances but not counted in net worth, income, spending or budgets.
  - One card per fund (held, members, purposes, archived).
  - "New group fund" button, and an empty state with an explanation and a primary action.
  - Reads: one `groupFunds` listener, mounted only while the tab is open. No events are read.
- **`app/(app)/group-funds/[id].tsx`** (one fund):
  - Held, collected, paid out and opening.
  - **Add contribution** and **Record payout**.
  - A "More" menu: opening balance, move between purposes, move between accounts, edit, archive or restore. Archiving asks for confirmation and says what stays counted.
  - **By purpose:** held per purpose, with cadence, the expected amount per member, and collected / paid out.
  - **History:** the newest 25 events live, then "Show older entries". Tapping an entry asks to undo it. The undo is a correction: the original is kept, the account balance is put back, and both halves of a transfer are undone. Undone rows are struck through, and pending rows say "Waiting to sync".
- **`GroupFundFormSheet`** (create and edit):
  - Name, notes, purposes (name, monthly or ad hoc, optional expected amount per member), and members.
  - Purposes and members that are already saved are archived, never removed.
- **`GroupFundEventSheet`:** one sheet for contribution, payout, opening, purpose transfer and account move. The fields follow the mode.
  - Account chips list bank, cash and wallet accounts only (`groupFundAccountOptions`).
  - A contribution pre-fills the purpose's expected amount.
  - A payout or transfer shows how much the purpose holds.

## Writes (`hooks/useGroupFundActions.ts`)
- **Loads first:** every write loads its fund from Firestore (`loadGroupFund`), never from the list, which may be the copy (R4.3a).
- **One id per submit:** the sheet mints the event id once (create mints the fund id once) and reuses it on retry.
- **One batch:** `commitGroupFundWrite` sends a single outbox batch.
- **Feedback:**
  - `writeSavedMessage` reports saved or will-sync.
  - Builder issues become plain sentences (`shared/utils/groupFundMessages.ts`).
  - Other errors go through `lib/errors.ts`, including late failures.

## Tests
- `shared/utils/groupFundMessages.test.ts`: issue messages, history row wording, which entries can be undone.
- `shared/utils/groupFundDocs.test.ts`: account options (bank and cash only).
- `shared/config/navigation.test.ts` and `routeRestoration.test.ts`: `/group-funds/f1` pops, and is restorable. The hub-section tests cover the new section and group.
- `shared/utils/dashboardAccountCards.test.ts`: still green, with the card route now set.
- **Full `npm test`:** 7,796 passed. The only failure is the known `lib/readModelLocal/store.test.ts`, which can't load because `fake-indexeddb` is missing.
- **`tsc`:** only the two known missing-package errors.
- **Web bundle:** `npx expo export --platform web` (see the commit report).

## Review fixes (user, 2026-11-06)
1. **The same member could be recorded twice for a month.** The contribution sheet now:
   - has a **"Counts for"** month (it defaults to the payment's month and can be stepped back, e.g. November money for October);
   - shows what the member already paid for that purpose and month, from one bounded query: `groupFundEvents where fundId, memberId, period`, equality filters only, with no composite index;
   - pre-fills what's still due;
   - asks **"Already paid?"** before recording more than is due, or a second payment for the month (`contributionDuplicateWarning`).
2. **Group money looked like the user's income and spending on account screens.**
   - Rows now carry a **"Held for others"** badge in the warning tone, with a neutral amount and icon, instead of "Income" / "Expense".
   - The account balance card shows **Held for others** and **Yours** under the real balance (`splitAccountBalance`, from the funds' stored `heldByAccount`).
   - The balance itself is unchanged.

## Not done here (S6, SPENDLY-688)
- The month view (every member, paid / partial / not paid), fund start month and member join/leave months. The "for month" field moved into S5.
- Reconciliation of held money against each account's balance.
- The QA suite and read instrumentation.

## Review
The user reviews this on local Expo web with demo data (Spendly Test on the emulator). Device QA comes after.
