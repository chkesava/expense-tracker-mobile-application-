import React, { createContext, useContext, useState, type ReactNode } from "react";
import type { Account, Expense, Income } from "@/shared/types/expense";
import { currentMonthKey } from "@/shared/utils/dates";

export interface ModalContextType {
  isAddExpenseOpen: boolean;
  setIsAddExpenseOpen: (open: boolean) => void;
  isMagicChatOpen: boolean;
  setIsMagicChatOpen: (open: boolean) => void;
  isReceiptScannerOpen: boolean;
  setIsReceiptScannerOpen: (open: boolean) => void;
  editingExpense: Expense | null;
  setEditingExpense: (expense: Expense | null) => void;
  editingIncome: Income | null;
  setEditingIncome: (income: Income | null) => void;
  accountEntryAccount: Account | null;
  setAccountEntryAccount: (account: Account | null) => void;
  isMonthDrawerOpen: boolean;
  setIsMonthDrawerOpen: (open: boolean) => void;
  globalMonth: string | null;
  setGlobalMonth: (month: string | null) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isMagicChatOpen, setIsMagicChatOpen] = useState(false);
  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [accountEntryAccount, setAccountEntryAccount] = useState<Account | null>(null);
  const [isMonthDrawerOpen, setIsMonthDrawerOpen] = useState(false);
  const [globalMonth, setGlobalMonth] = useState<string | null>(currentMonthKey());

  return (
    <ModalContext.Provider
      value={{
        isAddExpenseOpen,
        setIsAddExpenseOpen,
        isMagicChatOpen,
        setIsMagicChatOpen,
        isReceiptScannerOpen,
        setIsReceiptScannerOpen,
        editingExpense,
        setEditingExpense,
        editingIncome,
        setEditingIncome,
        accountEntryAccount,
        setAccountEntryAccount,
        isMonthDrawerOpen,
        setIsMonthDrawerOpen,
        globalMonth,
        setGlobalMonth,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModals() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModals must be used within a ModalProvider");
  }
  return context;
}
