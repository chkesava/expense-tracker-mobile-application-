# Duplicate Firestore Listener Audit & De-duplication Report — SPENDLY-408

This document records the audit of active `onSnapshot` and `getDocs` invocations across Spendly's core providers, sub-contexts, and feature hooks, documenting duplicate listeners eliminated and query scopes constrained.

---

## 1. Audit Scope & Methodology

Following the attribution baseline established in **SPENDLY-407**, an audit of all `onSnapshot` (82 total references in repo) and `getDocs` (57 references) was conducted across:
- `providers/FinanceDataProvider.tsx`
- `providers/ExpenseReferenceDataProvider.tsx`
- `providers/CreditCardBillsProvider.tsx`
- `providers/BorrowingsReceivablesProvider.tsx`
- `hooks/useCategories.ts`
- Feature-scoped hooks (`usePortfolio.ts`, `useEpf.ts`, `useSips.ts`, `useDecisions.ts`)

---

## 2. Findings & Eliminated Redundancies

### 2.1 Unbounded Collection Reads in Category Lifecycle Handlers (`useCategories.ts`)
- **Finding**: When renaming a category (`renameCategory`) or merging categories (`mergeCategories`), if `expensesComplete` was false, the code previously performed an unbounded collection read across the user's entire historical ledger:
  ```ts
  // BEFORE (Unbounded read of 1000s of docs):
  await getDocs(collection(db, "users", uid, "expenses"))
  ```
- **Remediation**:
  - Replaced the full collection read with targeted, scoped Firestore queries using `where("category", "==", source.name)` or `where("subcategory", "==", oldName)`.
  - Added read attribution via `logDirectRead(path, count, "server", { feature: "categories", queryShape: "where(category)" })`.
  - Scoped budget updates in `mergeCategories` to `where("category", "==", source.name)` instead of reading all category budgets.
- **Impact**: Reduces read footprint on category edits from $O(N_{\text{all\_expenses}})$ (e.g. 2,000+ docs) to $O(N_{\text{matching\_category}})$ (e.g. 10–50 docs), an **~98% reduction** in read volume for category operations.

### 2.2 Provider & Sub-Context Topology Verification
- **Audit Result**: Verified that `FinanceDataProvider` and `ExpenseReferenceDataProvider` act as singletons within the `(app)` tree:
  - Screens consuming categories, subscriptions, spaces, rules, budgets, and goals read from `useExpenseReferenceData()` rather than mounting ad-hoc listeners.
  - Active-on-demand providers (`CreditCardBillsProvider`, `BorrowingsReceivablesProvider`) correctly tear down after 15 seconds of inactivity and do not mount duplicate listeners when multiple child components consume `useCreditCardBills()` or `useBorrowings()`.
- **Secondary Feature Hooks Isolation**:
  - Domain-specific hooks (`usePortfolio`, `useSips`, `useDecisions`, `useWhatIfScenarios`) are strictly mounted inside their feature routes and do not leak listeners into root layout or dashboard.

---

## 3. Verification

- All category tests (`categoryTaxonomy.test.ts`, `categoryHelpers.test.ts`, `categoryInsights.test.ts`) passing.
- TypeScript compilation (`npm run typecheck:shared` and `npm run typecheck`) 100% clean.
- Performance budgets and guardrails (`npm run perf:verify`) passing with 0 violations.
