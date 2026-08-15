import { useReceivablesContext } from "@/providers/BorrowingsReceivablesProvider";

export type {
  CreateReceivableInput,
  AddReceivableRepaymentInput,
} from "@/providers/BorrowingsReceivablesProvider";

/** Reads the shared receivables listener — see BorrowingsReceivablesProvider. */
export function useReceivables() {
  return useReceivablesContext();
}
