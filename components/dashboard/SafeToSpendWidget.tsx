import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import {
  Section,
  useSurfaces,
  withAlpha,
} from "@/components/dashboard/primitives";
import {
  budgetStatusMessage,
  type SpendlyBudget,
} from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";

export interface SafeToSpendWidgetProps {
  budget: SpendlyBudget;
  currency: string;
  loading?: boolean;
}

function statusToneColor(
  status: SpendlyBudget["status"],
  colors: { destructive: string; warning: string; success: string }
) {
  if (status === "attention") return colors.destructive;
  if (status === "watch") return colors.warning;
  return colors.success;
}

export const SafeToSpendWidget = memo(function SafeToSpendWidget({
  budget,
  currency,
  loading = false,
}: SafeToSpendWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const ink = theme.colors.foreground;
  const subtle = theme.colors.mutedForeground;
  // Same status vocabulary as BudgetAlertsWidget (KAN-62) — this card and
  // the Monthly Budget card must always agree on tone for the same budget.
  const statusColor = statusToneColor(budget.status, theme.colors);

  // SPENDLY-532: the net-worth card is now the dashboard's one hero, so Safe
  // to Spend sits on the standard surface; the privacy toggle moved to the
  // dashboard header.
  return (
    <Section
      title="Safe to Spend"
      subtitle="How much can I spend?"
      icon={<Wallet size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
    >
      <View style={styles.hero}>
        <Text
          style={[
            styles.heroLabel,
            { color: subtle, fontFamily: theme.fontFamily.medium },
          ]}
        >
          Per remaining day
        </Text>
        {loading ? (
          <View style={{ marginVertical: 4 }}>
            <Skeleton width={160} height={42} borderRadius={8} />
          </View>
        ) : (
          <View style={styles.heroValueRow}>
            <Amount
              value={budget.safeToSpendDaily}
              currency={currency}
              ghostable
              numberOfLines={1}
              style={{
                fontSize: 30,
                lineHeight: 36,
                letterSpacing: -0.8,
                fontFamily: theme.fontFamily.bold,
                color: ink,
              }}
            />
            <Text
              style={[
                styles.perDay,
                { color: subtle, fontFamily: theme.fontFamily.medium },
              ]}
            >
              / day
            </Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text
            style={[
              styles.metaLabel,
              { color: subtle, fontFamily: theme.fontFamily.medium },
            ]}
          >
            Flexible remaining
          </Text>
          {loading ? (
            <Skeleton width={80} height={18} borderRadius={4} />
          ) : (
            <Amount
              value={budget.flexibleRemaining}
              currency={currency}
              ghostable
              style={{
                fontSize: 15,
                fontFamily: theme.fontFamily.semibold,
                color: ink,
              }}
            />
          )}
        </View>
        <View style={[styles.metaItem, styles.metaRight]}>
          <Text
            style={[
              styles.metaLabel,
              { color: subtle, fontFamily: theme.fontFamily.medium },
            ]}
          >
            Days left
          </Text>
          {loading ? (
            <Skeleton width={40} height={18} borderRadius={4} />
          ) : (
            <Text
              style={{
                fontSize: 15,
                fontFamily: theme.fontFamily.semibold,
                color: ink,
              }}
            >
              {budget.daysLeft}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <Skeleton width="100%" height={28} borderRadius={14} />
      ) : (
        <View
          style={[
            styles.statusStrip,
            { backgroundColor: withAlpha(statusColor, surfaces.isDark ? 0.16 : 0.1) },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: statusColor, fontFamily: theme.fontFamily.semibold },
            ]}
            numberOfLines={2}
          >
            {budgetStatusMessage(budget)}
          </Text>
        </View>
      )}
    </Section>
  );
});

const styles = StyleSheet.create({
  hero: {
    gap: 2,
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  perDay: {
    fontSize: 13,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  metaItem: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaRight: {
    alignItems: "flex-end",
  },
  metaLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  statusStrip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  statusText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
