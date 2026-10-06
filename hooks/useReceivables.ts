import { useEffect } from "react";
import { useReceivablesContext } from "@/providers/BorrowingsReceivablesProvider";

export type {
  CreateReceivableInput,
  AddReceivableRepaymentInput,
} from "@/providers/BorrowingsReceivablesProvider";

/** Reads the shared receivables listener — see BorrowingsReceivablesProvider. */
export function useReceivables(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const ctx = useReceivablesContext();

  useEffect(() => {
    if (!enabled) return;
    return ctx.registerSubscriber?.();
  }, [enabled, ctx.registerSubscriber]);

  return ctx;
}
