import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ExpensesTab = "history" | "income" | "audit" | "data";
export type SplitTab = "activity" | "management";
export type SubTab = "recurring" | "stats";
export type CollectTab = "requests" | "new";
export type LedgerTab =
  | "expenses"
  | "accounts"
  | "cards"
  | "borrowings"
  | "spaces"
  | "splits"
  | "subscriptions"
  | "travel"
  | "collect"
  | "investments"
  | "portfolio"
  | "sip";

export interface LedgerStateContextType {
  // Active Ledger Hub tab
  ledgerTab: LedgerTab;
  setLedgerTab: (tab: LedgerTab) => void;

  // Expenses (Journal) filters & tabs
  expensesTab: ExpensesTab;
  setExpensesTab: (tab: ExpensesTab) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedAccountTypeId: string;
  setSelectedAccountTypeId: (id: string) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  sortField: "date" | "amount";
  setSortField: (field: "date" | "amount") => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;

  // Splits tabs & filters
  splitTab: SplitTab;
  setSplitTab: (tab: SplitTab) => void;
  splitActivityFilter: "active" | "settled";
  setSplitActivityFilter: (filter: "active" | "settled") => void;

  // Subscriptions tabs
  subscriptionsTab: SubTab;
  setSubscriptionsTab: (tab: SubTab) => void;

  // Collect (Payment Requests) tabs
  collectTab: CollectTab;
  setCollectTab: (tab: CollectTab) => void;
}

const LedgerStateContext = createContext<LedgerStateContextType | undefined>(undefined);

export function LedgerStateProvider({ children }: { children: ReactNode }) {
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>("expenses");
  const [expensesTab, setExpensesTab] = useState<ExpensesTab>("history");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedAccountTypeId, setSelectedAccountTypeId] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [splitTab, setSplitTab] = useState<SplitTab>("activity");
  const [splitActivityFilter, setSplitActivityFilter] = useState<"active" | "settled">("active");

  const [subscriptionsTab, setSubscriptionsTab] = useState<SubTab>("recurring");
  const [collectTab, setCollectTab] = useState<CollectTab>("requests");

  const value = useMemo(
    () => ({
      ledgerTab,
      setLedgerTab,
      expensesTab,
      setExpensesTab,
      selectedCategory,
      setSelectedCategory,
      selectedAccountId,
      setSelectedAccountId,
      selectedAccountTypeId,
      setSelectedAccountTypeId,
      showFilters,
      setShowFilters,
      query,
      setQuery,
      sortField,
      setSortField,
      sortOrder,
      setSortOrder,
      splitTab,
      setSplitTab,
      splitActivityFilter,
      setSplitActivityFilter,
      subscriptionsTab,
      setSubscriptionsTab,
      collectTab,
      setCollectTab,
    }),
    [
      ledgerTab,
      expensesTab,
      selectedCategory,
      selectedAccountId,
      selectedAccountTypeId,
      showFilters,
      query,
      sortField,
      sortOrder,
      splitTab,
      splitActivityFilter,
      subscriptionsTab,
      collectTab,
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
