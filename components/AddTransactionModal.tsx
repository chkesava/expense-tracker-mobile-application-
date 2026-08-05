import { Modal } from "@/components/common/Modal";
import { ExpenseForm } from "@/components/ExpenseForm";
import { useModals } from "@/providers/ModalProvider";

export function AddTransactionModal() {
  const {
    isAddExpenseOpen,
    setIsAddExpenseOpen,
    editingExpense,
    setEditingExpense,
    editingIncome,
    setEditingIncome,
  } = useModals();

  const handleClose = () => {
    setIsAddExpenseOpen(false);
    setEditingExpense(null);
    setEditingIncome(null);
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
            : "Add Transaction"
      }
    >
      <ExpenseForm
        editingExpense={editingExpense}
        editingIncome={editingIncome}
        onSuccess={handleClose}
        onCancel={handleClose}
      />
    </Modal>
  );
}

export default AddTransactionModal;
