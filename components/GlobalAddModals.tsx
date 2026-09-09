import { CreateInvestmentModal } from "@/components/investments/CreateInvestmentModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { TransferFundsModal } from "@/components/accounts/TransferFundsModal";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useInvestments } from "@/hooks/useInvestments";
import { useModals } from "@/providers/ModalProvider";

/**
 * Mounts existing add flows for the global FAB sheet.
 * Does not rewrite ExpenseForm or the account/investment screens.
 */
export function GlobalAddModals() {
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { addInvestment } = useInvestments();
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
      <TransferFundsModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        accounts={accounts}
      />
      <CreateInvestmentModal
        visible={isCreateInvestmentOpen}
        onClose={() => setIsCreateInvestmentOpen(false)}
        onSubmit={addInvestment}
      />
      <PayCreditBillModal
        isOpen={isDebtPaymentOpen}
        onClose={() => setIsDebtPaymentOpen(false)}
        accounts={accounts}
        accountTypes={accountTypes}
      />
    </>
  );
}
