import { Modal } from "@/components/common/Modal";
import { ExpenseForm } from "@/components/ExpenseForm";
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

  const handleClose = () => {
    setIsAddExpenseOpen(false);
    setEditingExpense(null);
    setEditingIncome(null);
    // Reset so the next opener gets the default expense tab.
    setAddTransactionKind("expense");
  };

  return (
    <Modal
      isOpen={isAddExpenseOpen}
      onClose={handleClose}
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
      <ExpenseForm
        embedded
        initialType={addTransactionKind}
        editingExpense={editingExpense}
        editingIncome={editingIncome}
        onSuccess={handleClose}
        onCancel={handleClose}
      />
    </Modal>
  );
}

export default AddTransactionModal;
