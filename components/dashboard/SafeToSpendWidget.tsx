import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Eye, EyeOff, Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import {
  DASH_TYPE,
  HeroSection,
  withAlpha,
} from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
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
  const { settings, setGhostMode } = useSettings();
  const onHero = theme.colors.primaryForeground;
  // Same status vocabulary as BudgetAlertsWidget (KAN-62) — the hero card and
  // the Monthly Budget card must always agree on tone for the same budget.
  const statusColor = statusToneColor(budget.status, theme.colors);

  return (
    <HeroSection
      title="Safe to Spend"
      subtitle="How much can I spend?"
      icon={<Wallet size={16} color={onHero} strokeWidth={2.3} />}
      action={
        <Pressable
          onPress={() => {
            void haptic.selection();
            setGhostMode(!settings.ghostMode);
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.eyeButton,
            { backgroundColor: withAlpha(onHero, 0.16) },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            settings.ghostMode ? "Show amounts" : "Hide amounts"
          }
        >
          {settings.ghostMode ? (
            <EyeOff size={15} color={onHero} strokeWidth={2.3} />
          ) : (
            <Eye size={15} color={onHero} strokeWidth={2.3} />
          )}
        </Pressable>
      }
    >
      <View style={styles.hero}>
        <Text
          style={[
            styles.heroLabel,
            { color: withAlpha(onHero, 0.78), fontFamily: theme.fontFamily.medium },
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
              style={{
                fontSize: DASH_TYPE.heroValue,
                lineHeight: DASH_TYPE.heroValueLine,
                letterSpacing: -1,
                fontFamily: theme.fontFamily.bold,
                color: onHero,
              }}
            />
            <Text
              style={[
                styles.perDay,
                { color: withAlpha(onHero, 0.72), fontFamily: theme.fontFamily.medium },
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
              { color: withAlpha(onHero, 0.72), fontFamily: theme.fontFamily.medium },
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
                color: onHero,
              }}
            />
          )}
        </View>
        <View style={[styles.metaItem, styles.metaRight]}>
          <Text
            style={[
              styles.metaLabel,
              { color: withAlpha(onHero, 0.72), fontFamily: theme.fontFamily.medium },
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
                color: onHero,
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
            { backgroundColor: withAlpha(statusColor, 0.22) },
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
    </HeroSection>
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
  eyeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
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
