import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  createEmptyAccountActivityFilters,
  type AccountActivityFilters,
} from "@/shared/utils/accountActivityFilters";

export type ExpensesTab = "history" | "income" | "audit" | "data";
export type SubTab = "recurring" | "stats";
export type LedgerTab =
  | "expenses"
  | "accounts"
  | "cards"
  | "ccBills"
  | "borrowings"
  | "receivables"
  | "subscriptions";

export interface LedgerStateContextType {
  // Active Transactions hub tab
  ledgerTab: LedgerTab;
  setLedgerTab: (tab: LedgerTab) => void;

  // Expenses (Journal) filters & tabs
  expensesTab: ExpensesTab;
  setExpensesTab: (tab: ExpensesTab) => void;
  /**
   * SPENDLY-109 — the Journal's advanced filter set. Lives here rather than in
   * the screen so it survives a hop to another Transactions tab and back,
   * exactly as `query` already does.
   */
  journalFilters: AccountActivityFilters;
  /** Updater form: the chip handlers all apply functional updates. */
  setJournalFilters: Dispatch<SetStateAction<AccountActivityFilters>>;
  /** Visibility of the Journal's advanced filter sheet. */
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  sortField: "date" | "amount";
  setSortField: (field: "date" | "amount") => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;

  // Subscriptions tabs
  subscriptionsTab: SubTab;
  setSubscriptionsTab: (tab: SubTab) => void;
}

const LedgerStateContext = createContext<LedgerStateContextType | undefined>(undefined);

export function LedgerStateProvider({ children }: { children: ReactNode }) {
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>("expenses");
  const [expensesTab, setExpensesTab] = useState<ExpensesTab>("history");
  const [journalFilters, setJournalFilters] = useState<AccountActivityFilters>(
    createEmptyAccountActivityFilters
  );
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [subscriptionsTab, setSubscriptionsTab] = useState<SubTab>("recurring");

  const value = useMemo(
    () => ({
      ledgerTab,
      setLedgerTab,
      expensesTab,
      setExpensesTab,
      journalFilters,
      setJournalFilters,
      showFilters,
      setShowFilters,
      query,
      setQuery,
      sortField,
      setSortField,
      sortOrder,
      setSortOrder,
      subscriptionsTab,
      setSubscriptionsTab,
    }),
    [
      ledgerTab,
      expensesTab,
      journalFilters,
      showFilters,
      query,
      sortField,
      sortOrder,
      subscriptionsTab,
    ]
  );

  return (
    <LedgerStateContext.Provider value={value}>
      {children}
    </LedgerStateContext.Provider>
  );
}

export function useLedgerState() {
  const context = useContext(LedgerStateContext);
  if (context === undefined) {
    throw new Error("useLedgerState must be used within a LedgerStateProvider");
  }
  return context;
}
