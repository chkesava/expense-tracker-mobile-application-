import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Account, Expense, Income } from "@/shared/types/expense";
import { currentMonthKey } from "@/shared/utils/dates";

export type TransactionKind = "expense" | "income";

export interface MonthContextType {
  globalMonth: string | null;
  setGlobalMonth: (month: string | null) => void;
  isMonthDrawerOpen: boolean;
  setIsMonthDrawerOpen: (open: boolean) => void;
}

export interface ModalActionsType {
  setIsAddExpenseOpen: (open: boolean) => void;
  setAddTransactionKind: (kind: TransactionKind) => void;
  setIsMagicChatOpen: (open: boolean) => void;
  setIsReceiptScannerOpen: (open: boolean) => void;
  setEditingExpense: (expense: Expense | null) => void;
  setEditingIncome: (income: Income | null) => void;
  setAccountEntryAccount: (account: Account | null) => void;
  setIsSetupWizardOpen: (open: boolean) => void;
  setSetupWizardInitialStep: (step: number) => void;
  setIsAddSheetOpen: (open: boolean) => void;
  setIsTransferOpen: (open: boolean) => void;
  setIsCreateInvestmentOpen: (open: boolean) => void;
  setIsDebtPaymentOpen: (open: boolean) => void;
  /**
   * SPENDLY-141 — the add sheet offers Money Lent, Borrowing and Recurring,
   * so their create forms need an owner outside the list screens that used to
   * be the only way in.
   */
  setIsCreateReceivableOpen: (open: boolean) => void;
  setIsCreateBorrowingOpen: (open: boolean) => void;
  setIsCreateRecurringOpen: (open: boolean) => void;
}

export interface ModalUiContextType {
  isAddExpenseOpen: boolean;
  addTransactionKind: TransactionKind;
  isMagicChatOpen: boolean;
  isReceiptScannerOpen: boolean;
  editingExpense: Expense | null;
  editingIncome: Income | null;
  accountEntryAccount: Account | null;
  isSetupWizardOpen: boolean;
  setupWizardInitialStep: number;
  isAddSheetOpen: boolean;
  isTransferOpen: boolean;
  isCreateInvestmentOpen: boolean;
  isDebtPaymentOpen: boolean;
  isCreateReceivableOpen: boolean;
  isCreateBorrowingOpen: boolean;
  isCreateRecurringOpen: boolean;
}

export type ModalContextType = MonthContextType &
  ModalUiContextType &
  ModalActionsType;

const MonthContext = createContext<MonthContextType | undefined>(undefined);
const ModalUiContext = createContext<ModalUiContextType | undefined>(undefined);
const ModalActionsContext = createContext<ModalActionsType | undefined>(
  undefined
);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [addTransactionKind, setAddTransactionKind] =
    useState<TransactionKind>("expense");
  const [isMagicChatOpen, setIsMagicChatOpen] = useState(false);
  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [accountEntryAccount, setAccountEntryAccount] = useState<Account | null>(null);
  const [isMonthDrawerOpen, setIsMonthDrawerOpen] = useState(false);
  const [globalMonth, setGlobalMonth] = useState<string | null>(currentMonthKey());
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [setupWizardInitialStep, setSetupWizardInitialStep] = useState(0);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCreateInvestmentOpen, setIsCreateInvestmentOpen] = useState(false);
  const [isDebtPaymentOpen, setIsDebtPaymentOpen] = useState(false);
  const [isCreateReceivableOpen, setIsCreateReceivableOpen] = useState(false);
  const [isCreateBorrowingOpen, setIsCreateBorrowingOpen] = useState(false);
  const [isCreateRecurringOpen, setIsCreateRecurringOpen] = useState(false);

  const monthValue = useMemo(
    () => ({
      globalMonth,
      setGlobalMonth,
      isMonthDrawerOpen,
      setIsMonthDrawerOpen,
    }),
    [globalMonth, isMonthDrawerOpen]
  );

  const uiValue = useMemo(
    () => ({
      isAddExpenseOpen,
      addTransactionKind,
      isMagicChatOpen,
      isReceiptScannerOpen,
      editingExpense,
      editingIncome,
      accountEntryAccount,
      isSetupWizardOpen,
      setupWizardInitialStep,
      isAddSheetOpen,
      isTransferOpen,
      isCreateInvestmentOpen,
      isDebtPaymentOpen,
      isCreateReceivableOpen,
      isCreateBorrowingOpen,
      isCreateRecurringOpen,
    }),
    [
      isAddExpenseOpen,
      addTransactionKind,
      isMagicChatOpen,
      isReceiptScannerOpen,
      editingExpense,
      editingIncome,
      accountEntryAccount,
      isSetupWizardOpen,
      setupWizardInitialStep,
      isAddSheetOpen,
      isTransferOpen,
      isCreateInvestmentOpen,
      isDebtPaymentOpen,
      isCreateReceivableOpen,
      isCreateBorrowingOpen,
      isCreateRecurringOpen,
    ]
  );

  const actionsValue = useMemo(
    () => ({
      setIsAddExpenseOpen,
      setAddTransactionKind,
      setIsMagicChatOpen,
      setIsReceiptScannerOpen,
      setEditingExpense,
      setEditingIncome,
      setAccountEntryAccount,
      setIsSetupWizardOpen,
      setSetupWizardInitialStep,
      setIsAddSheetOpen,
      setIsTransferOpen,
      setIsCreateInvestmentOpen,
      setIsDebtPaymentOpen,
      setIsCreateReceivableOpen,
      setIsCreateBorrowingOpen,
      setIsCreateRecurringOpen,
    }),
    []
  );

  return (
    <ModalActionsContext.Provider value={actionsValue}>
      <MonthContext.Provider value={monthValue}>
        <ModalUiContext.Provider value={uiValue}>
          {children}
        </ModalUiContext.Provider>
      </MonthContext.Provider>
    </ModalActionsContext.Provider>
  );
}

function requireModalContext<T>(
  value: T | undefined,
  hookName: string
): T {
  if (value === undefined) {
    throw new Error(`${hookName} must be used within a ModalProvider`);
  }
  return value;
}

export function useGlobalMonth(): MonthContextType {
  return requireModalContext(useContext(MonthContext), "useGlobalMonth");
}

export function useModalActions(): ModalActionsType {
  return requireModalContext(useContext(ModalActionsContext), "useModalActions");
}

export function useModalUi(): ModalUiContextType {
  return requireModalContext(useContext(ModalUiContext), "useModalUi");
}

/** Compatibility merge of month + UI + actions. Prefer the split hooks on hot screens. */
export function useModals(): ModalContextType {
  const month = useGlobalMonth();
  const ui = useModalUi();
  const actions = useModalActions();
  return { ...month, ...ui, ...actions };
}
