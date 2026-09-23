import { Text } from "react-native";

import type { Account } from "@/shared/types/expense";
import {
  smsMatchingStatusLabel,
  smsMatchingUnconfiguredLabel,
} from "@/shared/utils/accountIdentity";
import { useTheme } from "@/theme/ThemeProvider";

/** Card / account header — warning when matching cannot run (legacy name). */
export function SmsMatchingUnconfiguredText({
  account,
  typeName,
}: {
  account: Pick<
    Account,
    | "institutionId"
    | "accountTypeId"
    | "last4"
    | "accountNumber"
    | "smsMatchingEnabled"
  >;
  typeName?: string;
}) {
  const { theme } = useTheme();
  const status = smsMatchingStatusLabel(account, typeName);
  if (!status) return null;

  // List/header still prioritizes the problem state; ready is shown too so
  // users can tell matching is configured (SPENDLY-108).
  const color =
    status.kind === "warning"
      ? theme.colors.warning
      : theme.colors.mutedForeground;

  return (
    <Text
      style={{
        color,
        fontSize: theme.typography.xs,
        fontWeight: "700",
        textAlign: "center",
      }}
    >
      {status.label}
    </Text>
  );
}

/** @deprecated Prefer SmsMatchingUnconfiguredText — kept for callers. */
export function smsMatchingWarningOnly(
  account: Pick<
    Account,
    "institutionId" | "accountTypeId" | "last4" | "accountNumber"
  >,
  typeName?: string
): string | null {
  return smsMatchingUnconfiguredLabel(account, typeName);
}
