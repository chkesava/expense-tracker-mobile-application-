import { Text } from "react-native";

import type { Account } from "@/shared/types/expense";
import { smsMatchingUnconfiguredLabel } from "@/shared/utils/accountIdentity";
import { useTheme } from "@/theme/ThemeProvider";

export function SmsMatchingUnconfiguredText({
  account,
  typeName,
}: {
  account: Pick<Account, "institutionId" | "accountTypeId">;
  typeName?: string;
}) {
  const { theme } = useTheme();
  const label = smsMatchingUnconfiguredLabel(account, typeName);
  if (!label) return null;

  return (
    <Text
      style={{
        color: theme.colors.warning,
        fontSize: theme.typography.xs,
        fontWeight: "700",
      }}
    >
      {label}
    </Text>
  );
}
