import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { usePortfolio } from "@/hooks/usePortfolio";
import {
  buildInvestmentCashActivities,
  filterInvestmentCashActivities,
  investmentCashEntryDetail,
  investmentCashEntryLabel,
  type InvestmentCashFilter,
} from "@/shared/features/portfolio/utils/investmentCash";
import type { InvestmentCashEntryType } from "@/shared/features/portfolio/types";
import { formatActivityDateLabel } from "@/shared/utils/activityDisplay";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

interface InvestmentCashHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  currency: string;
}

const FILTERS: { value: InvestmentCashFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "top_ups", label: "Top-ups" },
  { value: "purchases", label: "Purchases" },
  { value: "sales", label: "Sales" },
  { value: "adjustments", label: "Adjustments" },
];

const ENTRY_ICONS: Record<InvestmentCashEntryType, typeof ArrowDownLeft> = {
  TOP_UP: ArrowDownLeft,
  WITHDRAWAL: ArrowUpRight,
  PURCHASE: ShoppingCart,
  SALE: TrendingUp,
  ADJUSTMENT: SlidersHorizontal,
  REVERSAL: RotateCcw,
};

/**
 * Transaction history for the Investment Cash Balance, in the same shape as a bank
 * account's activity list.
 *
 * Every row is a ledger entry the balance is actually derived from, so the running
 * balance column always reconciles with the figure on the Stocks tab — which is the
 * point: before KAN-77 the balance was a stored number with nothing to check it
 * against.
 */
export function InvestmentCashHistoryModal({
  visible,
  onClose,
  currency,
}: InvestmentCashHistoryModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings, cashEntries, cashBalance } = usePortfolio();

  const [filter, setFilter] = useState<InvestmentCashFilter>("all");

  const activities = useMemo(
    () => buildInvestmentCashActivities(settings?.cashBaseline, cashEntries),
    [settings?.cashBaseline, cashEntries]
  );
  const visibleActivities = useMemo(
    () => filterInvestmentCashActivities(activities, filter),
    [activities, filter]
  );

  const baselineLabel = settings?.cashBaseline?.capturedAt
    ? new Date(settings.cashBaseline.capturedAt).toLocaleDateString()
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card
          style={[
            styles.contentCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={{ gap: 2 }}>
              <Text
                style={[
                  styles.title,
                  { color: theme.colors.foreground, fontSize: theme.typography.lg },
                ]}
              >
                Investment Cash History
              </Text>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                  fontWeight: "500",
                }}
              >
                Every movement of your Stocks Demat cash
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[
                styles.closeButton,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                },
              ]}
            >
              <X size={18} color={theme.colors.foreground} />
            </Pressable>
          </View>

          <View
            style={[
              styles.balanceBanner,
              {
                backgroundColor: isDark
                  ? "rgba(99, 102, 241, 0.12)"
                  : "rgba(99, 102, 241, 0.08)",
                borderColor: theme.colors.primary,
              },
            ]}
          >
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
                fontWeight: "600",
              }}
            >
              Current Cash Balance
            </Text>
            <Amount
              value={cashBalance}
              currency={currency}
              style={{ fontSize: 22, fontWeight: "800", color: theme.colors.foreground }}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((option) => {
              const isSelected = filter === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    haptic.selection().catch(() => undefined);
                    setFilter(option.value);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.foreground,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 2 }}>
            {visibleActivities.length === 0 ? (
              <View style={styles.emptyState}>
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    fontWeight: "700",
                    color: theme.colors.foreground,
                  }}
                >
                  {activities.length === 0
                    ? "No cash movements yet"
                    : "Nothing in this filter"}
                </Text>
                <Text
                  style={{
                    fontSize: theme.typography.xs,
                    color: theme.colors.mutedForeground,
                    textAlign: "center",
                    lineHeight: 18,
                  }}
                >
                  {activities.length === 0
                    ? "Transfer money in from a bank account, and every top-up, purchase and correction will be listed here."
                    : "Try a different filter to see your other cash movements."}
                </Text>
              </View>
            ) : (
              visibleActivities.map((row) => {
                const Icon = ENTRY_ICONS[row.entry.type] ?? SlidersHorizontal;
                const isCredit = row.delta >= 0;
                const detail = investmentCashEntryDetail(row.entry);
                return (
                  <View
                    key={row.entry.id}
                    style={[styles.activityRow, { borderBottomColor: theme.colors.border }]}
                  >
                    <View
                      style={[
                        styles.activityIcon,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                        },
                      ]}
                    >
                      <Icon
                        size={16}
                        color={isCredit ? theme.colors.success : theme.colors.mutedForeground}
                      />
                    </View>

                    <View style={styles.activityBody}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: theme.typography.sm,
                          fontWeight: "700",
                          color: theme.colors.foreground,
                        }}
                      >
                        {investmentCashEntryLabel(row.entry)}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={{
                          fontSize: theme.typography.xs,
                          color: theme.colors.mutedForeground,
                        }}
                      >
                        {[formatActivityDateLabel(row.entry.date), detail]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>

                    <View style={styles.activityAmounts}>
                      <Amount
                        value={Math.abs(row.delta)}
                        currency={currency}
                        prefix={isCredit ? "+" : "−"}
                        style={{
                          fontSize: theme.typography.sm,
                          fontWeight: "800",
                          color: isCredit ? theme.colors.success : theme.colors.foreground,
                        }}
                      />
                      <Amount
                        value={row.runningBalance}
                        currency={currency}
                        style={{
                          fontSize: theme.typography.xs,
                          color: theme.colors.mutedForeground,
                        }}
                      />
                    </View>
                  </View>
                );
              })
            )}

            {baselineLabel ? (
              <Text
                style={{
                  fontSize: theme.typography.xs,
                  color: theme.colors.mutedForeground,
                  textAlign: "center",
                  paddingVertical: 14,
                  lineHeight: 17,
                }}
              >
                Cash history starts from your balance on {baselineLabel}. Movements before
                that date are included in the opening balance rather than listed
                individually.
              </Text>
            ) : null}

            <View style={{ height: 24 }} />
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  contentCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    maxHeight: "85%",
    borderWidth: 1,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontWeight: "800",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterRow: {
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  activityBody: {
    flex: 1,
    gap: 2,
  },
  activityAmounts: {
    alignItems: "flex-end",
    gap: 2,
  },
  emptyState: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
});
