import { CreateInvestmentModal } from "@/components/investments/CreateInvestmentModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useInvestments } from "@/hooks/useInvestments";
import { useModals } from "@/providers/ModalProvider";

/**
 * Mounts existing add flows for the global FAB sheet.
 *
 * Transfer Funds and Create Investment are mounted only while open so the
 * portfolio/investments snapshot listeners are not held from the app shell
 * (SPENDLY-18). `useInvestments({ enabled: false })` supplies `addInvestment`
 * without subscribing to `users/{uid}/investments`.
 */
export function GlobalAddModals() {
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { addInvestment } = useInvestments({ enabled: false });
  const {
    isTransferOpen,
    setIsTransferOpen,
    isCreateInvestmentOpen,
    setIsCreateInvestmentOpen,
    isDebtPaymentOpen,
    setIsDebtPaymentOpen,
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
    </>
  );
}
