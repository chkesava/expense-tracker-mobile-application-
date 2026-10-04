import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Hourglass } from "lucide-react-native";

import { useRunwayOverrides } from "@/hooks/useRunwayOverrides";
import type { Account } from "@/shared/types/expense";
import { classifyResource, resourceKindForAccount, runwayOverrideId } from "@/shared/utils/runwayContract";
import { runwayReasonText } from "@/shared/utils/runwayLabels";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One-line runway status on the account detail screen (SPENDLY-207): whether
 * this account counts toward Financial Runway and why. Opens Runway sources,
 * where the choice can be changed.
 */
export function AccountRunwayRow({
  account,
  typeName,
  balance,
  asOf,
  displayCurrency,
  onOpen,
}: {
  account: Account;
  typeName: string;
  balance: number;
  asOf: string;
  displayCurrency: string;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const { overrides } = useRunwayOverrides();

  const resource = useMemo(() => {
    const kind = resourceKindForAccount(account, typeName);
    const override = overrides.find((o) => o.id === runwayOverrideId(kind, account.id)) ?? null;
    return classifyResource({
      kind,
      refId: account.id,
      label: account.name,
      amount: balance,
      currency: account.currency,
      displayCurrency,
      override,
      provenance: { source: "accounts", refId: account.id, asOf, certainty: "actual" },
    });
  }, [account, typeName, balance, asOf, displayCurrency, overrides]);

  const status = resource.included ? "Counted toward runway" : "Not counted toward runway";
  const reason = runwayReasonText(resource);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Financial runway: ${status}. ${reason}`}
      accessibilityHint="Opens runway sources, where you can change what counts"
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.space.md,
          padding: theme.space.md,
          borderRadius: theme.radius.md,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.muted : theme.colors.card,
        },
      ]}
    >
      <Hourglass size={18} color={theme.colors.primary} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{status}</Text>
        <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {reason}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 56 },
});
