import { StyleSheet, Text, View } from "react-native";

import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { useTheme } from "@/theme/ThemeProvider";

export function accountabilityText(input: {
  paidBy?: string;
  collectedBy?: string;
  contributedBy?: string;
  enteredBy?: string;
}): string {
  return [
    input.paidBy ? `Paid by ${input.paidBy}` : null,
    input.collectedBy ? `Collected by ${input.collectedBy}` : null,
    input.contributedBy ? `Contributed by ${input.contributedBy}` : null,
    input.enteredBy ? `Added by ${input.enteredBy}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Who did what, and when. Two styled lines rather than one `Text` with an
 * embedded newline, so the timestamp can be quieter than the attribution.
 */
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
  const who = accountabilityText({ paidBy, collectedBy, contributedBy, enteredBy });
  const when = formatGaneshWhen(at, date);

  if (!who && !when) return null;

  return (
    <View style={styles.wrap}>
      {who ? (
        <Text
          numberOfLines={2}
          style={[styles.who, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        >
          {who}
        </Text>
      ) : null}
      {when ? (
        <Text
          numberOfLines={1}
          style={[styles.when, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
        >
          {when}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 1,
  },
  who: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  when: {
    fontSize: 11,
    lineHeight: 15,
    opacity: 0.8,
  },
});
