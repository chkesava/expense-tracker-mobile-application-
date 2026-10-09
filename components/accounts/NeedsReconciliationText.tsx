import { Text } from "react-native";

import type { Account } from "@/shared/types/expense";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * SPENDLY-436: an account whose materialized summary was never seeded (or
 * was mutated before it was) gets flagged `needs_reconciliation` rather than
 * silently presented as healthy. Mirrors SmsMatchingUnconfiguredText's
 * warning-line pattern.
 */
export function NeedsReconciliationText({
  account,
}: {
  account: Pick<Account, "balanceReconciliationStatus" | "summaryReconciliationStatus">;
}) {
  const { theme } = useTheme();
  const needsReconciliation =
    account.balanceReconciliationStatus === "needs_reconciliation" ||
    account.summaryReconciliationStatus === "needs_reconciliation";
  if (!needsReconciliation) return null;

  return (
    <Text
      style={{
        color: theme.colors.warning,
        fontSize: theme.typography.xs,
        fontWeight: "700",
        textAlign: "center",
      }}
    >
      Balance pending reconciliation — tap Edit to rebuild
    </Text>
  );
}
