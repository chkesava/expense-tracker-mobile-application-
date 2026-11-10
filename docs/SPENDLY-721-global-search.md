# SPENDLY-721: Global search (header search field + Ctrl/⌘K)

**Type:** Feature / Follow-up from SPENDLY-718. **Branch:** `feat/SPENDLY-721-global-search` (from `main`).

## Goal
Provide a unified, local-first global search palette that finds anything in the user's Spendly data and jumps straight to it.

Replaces the previous placeholder behavior where the desktop search field and phone search icon simply navigated to `/ledger`.

## Entry points
1. **Desktop web header:** Wide search field ("Search transactions, accounts…") with a `Ctrl K` badge (`components/layout/AppBarActions.tsx`).
2. **Phone & native header:** Search icon button in `AppBarActions.tsx`.
3. **Web keyboard shortcut:** `Ctrl + K` or `⌘ + K` anywhere across the app (`app/(app)/_layout.tsx`).

## Scope & Capabilities
- **Local-first only:** Zero new Firestore listeners and zero per-keystroke Firestore reads. Searches over in-memory stores already mounted by the app (`useExpenses`, `useIncomes`, `useAccounts`, `useCategories`, `useExpenseReferenceData`).
- **Grouped results:**
  - **Screens & Navigation:** `CORE_NAV_ITEMS` and `LEDGER_SECTIONS` (e.g. Journal, Vaults, Investments, Insights, Settings, CC Bills, Subscriptions).
  - **Quick Actions:** "Add Expense", "Add Income", "Transfer", "Scan Receipt", "Magic Chat", "Add Investment", "Money Lent", "Borrow Money" via `useModalActions()`.
  - **Accounts & Cards:** Match name, institution, and type; opens `/accounts/[id]`.
  - **Categories & Subcategories:** Match category and subcategory names; opens category drill-down (`/spending/[category]`).
  - **Merchants:** Distinct merchants derived from loaded transactions; opens merchant profile (`/merchants/[id]`).
  - **Transactions:** Expenses and incomes matching note, category, subcategory, merchant, counterparty, tags, or numeric amount (`amountMatchesToken`). Deep links to `/transactions/[id]?kind=...&accountId=...`.
  - **Recurring & Bills / Save Goals:** Subscriptions and goals matching by name; opens their respective screens.
- **Deep link to Insights › Search & Lab:**
  - If matching transactions exist, a footer banner offers "View all N matching transactions in Search & Lab ›", opening `/insights?tab=search&q=[query]`.
- **Ghost Mode:**
  - All amounts (transaction rows, account balances) adhere to `settings.ghostMode` via `ghostMoney` / `useGhostMoney`.
- **Recent searches:**
  - Stored strictly on-device in `AsyncStorage` (`@spendly_recent_searches`). Displayed when search input is empty, along with quick actions. Users can remove individual chips or clear all.
- **Responsive command palette:**
  - On desktop web (medium / expanded): Centred dialog capped at `SPENDLY_DIALOG_MAX_WIDTH` (560px).
  - On phone / native (compact): Bottom sheet / full modal.
  - Keyboard navigation on web: `ArrowDown` / `ArrowUp` to navigate items, `Enter` to open, `Escape` to close. Match highlighting via `HighlightedText`.

## Architecture & Code Changes
- **`shared/utils/globalSearch.ts`**: Pure search functions, scoring algorithms, multi-token matching, amount value matching, and recent searches array management.
- **`shared/utils/globalSearch.test.ts`**: 18 unit tests validating tokenization, scoring, multi-token narrowing, category deep links, merchant links, amount matches, and recent searches handling.
- **`providers/ModalProvider.tsx`**: Added `isGlobalSearchOpen: boolean` and `setIsGlobalSearchOpen: (open: boolean) => void`.
- **`components/search/GlobalSearchModal.tsx`**: Command palette dialog UI with pinned search input, empty state with recent searches & quick actions, grouped result rows with highlighted text, ghost money formatting, and keyboard support.
- **`components/layout/AppBarActions.tsx`**: Wired search field and icon button to open global search instead of routing to `/ledger`. Added `Ctrl K` badge on web.
- **`app/(app)/_layout.tsx`**: Mounted `<GlobalSearchModal />` inside `OverlayProvider`, and added global `Ctrl+K` / `⌘K` keyboard event listener on web.

## Invariants kept
- **Zero extra Firestore reads:** Zero per-keystroke queries; pure in-memory search over already-mounted providers.
- **Privacy:** Ghost mode hides transaction and account amounts. Recent searches never leave the device.
- **Multi-app safety:** Only Expense app shell touched; Nutrition and Ganesh Seva are unaffected.
- **Backward compatibility:** Existing per-screen searches (`SearchBar`, Search & Lab) remain completely intact.

## Manual Testing Guide
1. **Desktop Web:**
   - Press `Ctrl + K` or `⌘ + K`. The global search command palette opens centered at 560px.
   - When query is empty, observe recent searches (if any) and Quick Actions grid ("Add Expense", "Add Income", "Transfer", "Scan Receipt").
   - Type a merchant name (e.g. "swiggy"): observe matching merchant row and transactions with highlighted search terms.
   - Type a category name (e.g. "Food"): observe category overview link.
   - Type an amount (e.g. "500"): observe transactions with amount 500.
   - Use `↓` and `↑` keys to navigate results. Press `Enter` on a result to navigate to its screen or open the action modal.
   - Press `Esc` to close the palette.
   - Click the header search field: palette opens with search input auto-focused.
2. **Mobile / Emulator:**
   - Tap the search icon in the header. The search sheet slides up.
   - Tap "Add Expense" under Quick Actions: global search closes and Add Expense sheet opens.
   - Tap search icon again, type a query, select a transaction row: transaction details open.
