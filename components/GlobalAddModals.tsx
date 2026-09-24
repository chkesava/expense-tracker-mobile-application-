import { CreateBorrowingModal } from "@/components/borrowings/CreateBorrowingModal";
import { CreateReceivableModal } from "@/components/receivables/CreateReceivableModal";
import { EditSubscriptionModal } from "@/components/subscriptions/EditSubscriptionModal";
import { CreateInvestmentModal } from "@/components/investments/CreateInvestmentModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useInvestments } from "@/hooks/useInvestments";
import { useReceivables } from "@/hooks/useReceivables";
import { useModals } from "@/providers/ModalProvider";

/**
 * Mounts existing add flows for the global FAB sheet.
 *
 * Transfer Funds and Create Investment are mounted only while open so the
 * portfolio/investments snapshot listeners are not held from the app shell
 * (SPENDLY-18). `useInvestments({ enabled: false })` supplies `addInvestment`
 * without subscribing to `users/{uid}/investments`.
 *
 * SPENDLY-141 adds Money Lent, Borrowing and Recurring, which the add sheet
 * now offers from any screen. The first two write through
 * `BorrowingsReceivablesProvider`, already mounted by the app shell, so no new
 * listener is opened; the recurring form is mounted only while open for the
 * same reason Transfer and Create Investment are.
 */
export function GlobalAddModals() {
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { addInvestment } = useInvestments({ enabled: false });
  const { createReceivable } = useReceivables();
  const { createBorrowing } = useBorrowings();
  const {
    isTransferOpen,
    setIsTransferOpen,
    isCreateInvestmentOpen,
    setIsCreateInvestmentOpen,
    isDebtPaymentOpen,
    setIsDebtPaymentOpen,
    isCreateReceivableOpen,
    setIsCreateReceivableOpen,
    isCreateBorrowingOpen,
    setIsCreateBorrowingOpen,
    isCreateRecurringOpen,
    setIsCreateRecurringOpen,
  } = useModals();

  return (
    <>
      {isTransferOpen ? (
        <TransferFundsModal
          isOpen
          onClose={() => setIsTransferOpen(false)}
          accounts={accounts}
        />
      ) : null}
      {isCreateInvestmentOpen ? (
        <CreateInvestmentModal
          visible
          onClose={() => setIsCreateInvestmentOpen(false)}
          onSubmit={addInvestment}
        />
      ) : null}
      {isDebtPaymentOpen ? (
        <PayCreditBillModal
          isOpen
          onClose={() => setIsDebtPaymentOpen(false)}
          accounts={accounts}
          accountTypes={accountTypes}
        />
      ) : null}
      {isCreateReceivableOpen ? (
        <CreateReceivableModal
          visible
          onClose={() => setIsCreateReceivableOpen(false)}
          onSubmit={createReceivable}
        />
      ) : null}
      {isCreateBorrowingOpen ? (
        <CreateBorrowingModal
          visible
          onClose={() => setIsCreateBorrowingOpen(false)}
          onSubmit={createBorrowing}
        />
      ) : null}
      {isCreateRecurringOpen ? (
        <EditSubscriptionModal
          visible
          subscription={null}
          onClose={() => setIsCreateRecurringOpen(false)}
        />
      ) : null}
    </>
  );
}
