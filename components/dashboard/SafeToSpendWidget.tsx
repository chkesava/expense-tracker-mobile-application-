import { StyleSheet, Text, View } from "react-native";
import { Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  MetaLabel,
  Section,
  StatusStrip,
  useSurfaces,
} from "@/components/dashboard/primitives";
import {
  budgetStatusMessage,
  type SpendlyBudget,
} from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";

export interface SafeToSpendWidgetProps {
  budget: SpendlyBudget;
  currency: string;
}

function statusTone(status: SpendlyBudget["status"]) {
  if (status === "attention") return "negative" as const;
  if (status === "watch") return "warning" as const;
  return "positive" as const;
}

export function SafeToSpendWidget({ budget, currency }: SafeToSpendWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const tone = statusTone(budget.status);
  const accent =
    tone === "negative"
      ? theme.colors.destructive
      : tone === "warning"
        ? theme.colors.warning
        : theme.colors.success;

  return (
    <Section
      title="Safe to Spend"
      subtitle="How much can I spend?"
      icon={<Wallet size={16} color={accent} strokeWidth={2.3} />}
      iconTint={surfaces.wash(accent)}
    >
      <View style={styles.hero}>
        <MetaLabel>Per remaining day</MetaLabel>
        <Amount
          value={budget.safeToSpendDaily}
          currency={currency}
          ghostable
          style={{
            fontSize: 32,
            lineHeight: 38,
            letterSpacing: -1,
            fontFamily: theme.fontFamily.bold,
            color: theme.colors.foreground,
          }}
        />
        <Text
          style={[
            styles.perDay,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
          ]}
        >
          / day
        </Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <MetaLabel>Flexible remaining</MetaLabel>
          <Amount
            value={budget.flexibleRemaining}
            currency={currency}
            ghostable
            style={{
              fontSize: 15,
              fontFamily: theme.fontFamily.semibold,
              color: theme.colors.foreground,
            }}
          />
        </View>
        <View style={[styles.metaItem, styles.metaRight]}>
          <MetaLabel>Days left</MetaLabel>
          <Text
            style={{
              fontSize: 15,
              fontFamily: theme.fontFamily.semibold,
              color: theme.colors.foreground,
            }}
          >
            {budget.daysLeft}
          </Text>
        </View>
      </View>

      <StatusStrip tone={tone} message={budgetStatusMessage(budget)} />
    </Section>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 2,
    marginBottom: 14,
  },
  perDay: {
    fontSize: 13,
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
});
