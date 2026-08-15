import { useBorrowingsContext } from "@/providers/BorrowingsReceivablesProvider";

export type {
  CreateBorrowingInput,
  AddRepaymentInput,
} from "@/providers/BorrowingsReceivablesProvider";

/** Reads the shared borrowings listener — see BorrowingsReceivablesProvider. */
export function useBorrowings() {
  return useBorrowingsContext();
}
