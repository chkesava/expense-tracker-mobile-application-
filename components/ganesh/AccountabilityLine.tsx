import { Text } from "react-native";

import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { useTheme } from "@/theme/ThemeProvider";

export function AccountabilityLine({
  paidBy,
  collectedBy,
  contributedBy,
  enteredBy,
  at,
  date,
}: {
  paidBy?: string;
  collectedBy?: string;
  contributedBy?: string;
  enteredBy?: string;
  at?: { seconds?: number; toDate?: () => Date } | null;
  date?: string;
}) {
  const { theme } = useTheme();
  const parts = [
    paidBy ? `Paid by ${paidBy}` : null,
    collectedBy ? `Collected by ${collectedBy}` : null,
    contributedBy ? `Contributed by ${contributedBy}` : null,
    enteredBy ? `Added by ${enteredBy}` : null,
  ].filter(Boolean);
  const when = formatGaneshWhen(at, date);
  return (
    <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
      {parts.join(" · ")}
      {when ? `\n${when}` : ""}
    </Text>
  );
}
