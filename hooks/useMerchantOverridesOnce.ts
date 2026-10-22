import { useEffect, useState } from "react";

import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { listMerchantOverrides } from "@/services/merchant/merchantOverrideStore";
import type { MerchantOverride } from "@/shared/types/merchant";

/**
 * SPENDLY-570 — the user's merchant corrections, read once (no listener), the
 * same one-off read the transaction and merchant screens make. `enabled`
 * defers it until a caller actually has rows to resolve (SPENDLY-406).
 * Failure leaves the list empty: rows then fall back to registry matches.
 */
export function useMerchantOverridesOnce(enabled: boolean): MerchantOverride[] {
  const { user } = useAuth();
  const uid = user?.uid;
  const [overrides, setOverrides] = useState<MerchantOverride[]>([]);

  useEffect(() => {
    if (!enabled || !uid) return;
    let cancelled = false;
    listMerchantOverrides(uid)
      .then((list) => {
        if (!cancelled) setOverrides(list);
      })
      .catch((error) => logError("merchantOverrides.dashboard", error));
    return () => {
      cancelled = true;
    };
  }, [enabled, uid]);

  return overrides;
}
