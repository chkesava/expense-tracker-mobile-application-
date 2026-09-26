import { useCallback, useRef } from "react";

import { Modal } from "@/components/common/Modal";
import { ExpenseForm } from "@/components/ExpenseForm";
import { appDialog } from "@/lib/appDialog";
import { useModals } from "@/providers/ModalProvider";

export function AddTransactionModal() {
  const {
    isAddExpenseOpen,
    setIsAddExpenseOpen,
    addTransactionKind,
    setAddTransactionKind,
    editingExpense,
    setEditingExpense,
    editingIncome,
    setEditingIncome,
  } = useModals();
  const editDirtyRef = useRef(false);

  const handleClose = () => {
    editDirtyRef.current = false;
    setIsAddExpenseOpen(false);
    setEditingExpense(null);
    setEditingIncome(null);
    // Reset so the next opener gets the default expense tab.
    setAddTransactionKind("expense");
  };

  const requestClose = () => {
    if (!editDirtyRef.current) {
      handleClose();
      return;
    }
    appDialog.show({
      title: "Discard changes?",
      message: "Your edits to this transaction haven't been saved.",
      buttons: [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: handleClose },
      ],
    });
  };

  const handleDirtyChange = useCallback((dirty: boolean) => {
    editDirtyRef.current = dirty;
  }, []);

  return (
    <Modal
      // SPENDLY-173: the form needs the full width; see Modal's `density`.
      density="compact"
      isOpen={isAddExpenseOpen}
      onClose={requestClose}
      title={
        editingExpense
          ? "Edit Expense"
          : editingIncome
            ? "Edit Income"
            : addTransactionKind === "income"
              ? "Add Income"
              : "Add Transaction"
      }
    >
      {isAddExpenseOpen ? (
        <ExpenseForm
          embedded
          initialType={addTransactionKind}
          editingExpense={editingExpense}
          editingIncome={editingIncome}
          onSuccess={handleClose}
          onCancel={requestClose}
          onDirtyChange={handleDirtyChange}
        />
      ) : null}
    </Modal>
  );
}

export default AddTransactionModal;
