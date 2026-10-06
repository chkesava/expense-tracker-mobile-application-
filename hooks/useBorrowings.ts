import { useEffect } from "react";
import { useBorrowingsContext } from "@/providers/BorrowingsReceivablesProvider";

export type {
  CreateBorrowingInput,
  AddRepaymentInput,
} from "@/providers/BorrowingsReceivablesProvider";

/** Reads the shared borrowings listener — see BorrowingsReceivablesProvider. */
export function useBorrowings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const ctx = useBorrowingsContext();

  useEffect(() => {
    if (!enabled) return;
    return ctx.registerSubscriber?.();
  }, [enabled, ctx.registerSubscriber]);

  return ctx;
}
