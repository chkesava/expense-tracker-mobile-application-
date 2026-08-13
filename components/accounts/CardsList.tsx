import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Plus,
  ShieldAlert,
  Sparkles,
} from "lucide-react-native";

import { EditAccountModal } from "@/components/accounts/EditAccountModal";
import { PayCreditBillModal } from "@/components/accounts/PayCreditBillModal";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Account } from "@/shared/types/expense";
import { computeCreditUsage } from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { formatAccountIdentityLine } from "@/shared/utils/accountIdentity";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function CardsList() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses } = useExpenses();
  const { payments } = useAccountPayments();

  const [editingCard, setEditingCard] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedPayCardId, setSelectedPayCardId] = useState<string | undefined>();

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  // Filter credit card accounts
  const creditCards = useMemo(() => {
    return accounts.filter((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      return getAccountKind(typeName) === "credit";
    });
  }, [accounts, typeMap]);

  // Aggregate stats across all credit cards
  const creditOverview = useMemo(() => {
    let totalLimit = 0;
    let totalUsed = 0;

    creditCards.forEach((c) => {
      const usage = computeCreditUsage(c, expenses, payments);
      totalLimit += c.creditLimit || 0;
      totalUsed += usage.usedThisCycle;
    });

    const totalAvailable = Math.max(0, totalLimit - totalUsed);
    const utilizationRate =
      totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;

    return { totalLimit, totalUsed, totalAvailable, utilizationRate };
  }, [creditCards, expenses, payments]);

  const handleOpenCardDetail = (card: Account) => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push({
      pathname: "/accounts/[id]",
      params: { id: card.id },
    });
  };

  const handleOpenPayBill = (cardId?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setSelectedPayCardId(cardId || creditCards[0]?.id);
    setIsPayModalOpen(true);
  };

  const handleOpenAddCard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setEditingCard(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditCard = (card: Account) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setEditingCard(card);
    setIsEditModalOpen(true);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Credit Overview Hero Banner */}
      <Card
        style={[
          styles.overviewCard,
          {
            backgroundColor: isDark
              ? "rgba(49, 46, 129, 0.45)"
              : "rgba(243, 232, 255, 0.9)",
            borderColor: theme.colors.primary,
          },
        ]}
      >
        <View style={styles.overviewHeader}>
          <View style={styles.overviewTitleRow}>
            <CreditCard size={18} color={theme.colors.primary} />
            <Text
              style={[
                styles.overviewLabel,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Total Credit Used
            </Text>
          </View>
          <View
            style={[
              styles.utilizationBadge,
              {
                backgroundColor:
                  creditOverview.utilizationRate > 70
                    ? "rgba(239, 68, 68, 0.15)"
                    : creditOverview.utilizationRate > 30
                      ? "rgba(245, 158, 11, 0.15)"
                      : "rgba(34, 197, 94, 0.15)",
              },
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color:
                  creditOverview.utilizationRate > 70
                    ? theme.colors.destructive
                    : creditOverview.utilizationRate > 30
                      ? theme.colors.warning
                      : theme.colors.success,
              }}
            >
              {creditOverview.utilizationRate.toFixed(0)}% Utilized
            </Text>
          </View>
        </View>

        <Amount
          value={creditOverview.totalUsed}
          currency={system.defaultCurrency}
          ghostable
          style={{
          fontSize: 28,
            fontWeight: "800",
            color: theme.colors.destructive,
          }}
        />

        {/* Aggregate Progress Bar */}
        <View
          style={[
            styles.progressBarBg,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${creditOverview.utilizationRate}%`,
                backgroundColor:
                  creditOverview.utilizationRate > 70
                    ? theme.colors.destructive
                    : creditOverview.utilizationRate > 30
                      ? theme.colors.warning
                      : theme.colors.primary,
              },
            ]}
          />
        </View>

        <View style={styles.overviewSubRow}>
          <View style={styles.overviewStat}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
              }}
            >
              Total Limit
            </Text>
            <Amount
              value={creditOverview.totalLimit}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <View
            style={[
              styles.overviewDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.overviewStat}>
            <Text
              style={{
                fontSize: theme.typography.xs,
                color: theme.colors.mutedForeground,
              }}
            >
              Available Credit
            </Text>
            <Amount
              value={creditOverview.totalAvailable}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: theme.colors.success,
              }}
            />
          </View>
        </View>
      </Card>

      {/* Quick Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={handleOpenAddCard}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Plus size={16} color={theme.colors.primary} />
          <Text
            style={[
              styles.actionButtonText,
              { color: theme.colors.foreground },
            ]}
          >
            Add Card
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleOpenPayBill()}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <CheckCircle2 size={16} color={theme.colors.success} />
          <Text
            style={[
              styles.actionButtonText,
              { color: theme.colors.foreground },
            ]}
          >
            Pay Bill
          </Text>
        </Pressable>
      </View>

      {/* Cards List */}
      {creditCards.length === 0 ? (
        <EmptyState
          illustration="cards"
          title="No Credit Cards Added"
          description="Keep track of billing statement dates, credit limits, and automatic due date reminders."
          primaryAction={{
            label: "Add Credit Card",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: handleOpenAddCard,
          }}
          secondaryAction={{
            label: "Record Bill Payment",
            icon: <CheckCircle2 size={16} color={theme.colors.success} />,
            onPress: () => handleOpenPayBill(),
          }}
          tip="Setting your billing cycle reset date enables automated payment countdowns and credit health tracking."
        />
      ) : (
        <View style={{ gap: 14 }}>
          {creditCards.map((card) => {
            const usage = computeCreditUsage(card, expenses, payments);
            const limit = card.creditLimit || 0;
            const util = limit > 0 ? (usage.usedThisCycle / limit) * 100 : 0;
            const cardColor = card.color || "#4F46E5";

            return (
              <Pressable
                key={card.id}
                onPress={() => handleOpenCardDetail(card)}
                onLongPress={() => handleOpenEditCard(card)}
                style={({ pressed }) => [
                  styles.cardBox,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                {/* Header Strip */}
                <View style={styles.cardTopRow}>
                  <View style={styles.cardBrandRow}>
                    <View
                      style={[
                        styles.cardIconBox,
                        { backgroundColor: cardColor },
                      ]}
                    >
                      <CreditCard size={18} color="#FFF" />
                    </View>
                    <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.cardName,
                          {
                            color: theme.colors.foreground,
                            fontSize: theme.typography.md,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {card.name}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.mutedForeground,
                          fontSize: theme.typography.xs,
                        }}
                        numberOfLines={1}
                      >
                        {formatAccountIdentityLine(card, "Credit Card")}
                      </Text>
                    </View>
                  </View>

                  {/* Reset Countdown Badge */}
                  <View
                    style={[
                      styles.resetBadge,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Calendar size={12} color={theme.colors.mutedForeground} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      Resets in {usage.daysRemaining}d
                    </Text>
                  </View>
                </View>

                {/* Used vs Limit Metrics */}
                <View style={styles.metricsRow}>
                  <View>
                    <Text
                      style={{
                        fontSize: theme.typography.xs,
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      Current Used
                    </Text>
                    <Amount
                      value={usage.usedThisCycle}
                      currency={system.defaultCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.lg,
                        fontWeight: "800",
                        color:
                          usage.usedThisCycle > 0
                            ? theme.colors.destructive
                            : theme.colors.foreground,
                      }}
                    />
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontSize: theme.typography.xs,
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      Available Limit
                    </Text>
                    <Amount
                      value={usage.availableCredit}
                      currency={system.defaultCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.lg,
                        fontWeight: "800",
                        color: theme.colors.success,
                      }}
                    />
                  </View>
                </View>

                {/* Card Progress Bar */}
                <View
                  style={[
                    styles.progressBarBg,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.05)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, util)}%`,
                        backgroundColor:
                          util > 70
                            ? theme.colors.destructive
                            : util > 30
                              ? theme.colors.warning
                              : cardColor,
                      },
                    ]}
                  />
                </View>

                {/* Bottom CTA Row */}
                <View style={styles.cardFooter}>
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      color: theme.colors.mutedForeground,
                    }}
                  >
                    Limit: {system.defaultCurrency} {limit.toLocaleString()}
                  </Text>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      handleOpenPayBill(card.id);
                    }}
                    style={[
                      styles.payBtn,
                      {
                        backgroundColor: isDark
                          ? "rgba(34, 197, 94, 0.15)"
                          : "rgba(34, 197, 94, 0.1)",
                        borderColor: theme.colors.success,
                      },
                    ]}
                  >
                    <CheckCircle2 size={13} color={theme.colors.success} />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: theme.colors.success,
                      }}
                    >
                      Pay Bill
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Modals */}
      <EditAccountModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        account={editingCard}
      />

      <PayCreditBillModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        defaultCreditCardId={selectedPayCardId}
        accounts={accounts}
        accountTypes={accountTypes}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 18,
    paddingBottom: 40,
  },
  overviewCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 12,
  },
  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overviewTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overviewLabel: {
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  utilizationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  overviewSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  overviewStat: {
    alignItems: "center",
    gap: 2,
  },
  overviewDivider: {
    width: 1,
    height: 24,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardBox: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  cardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontWeight: "700",
  },
  resetBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    flexShrink: 0,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginTop: 20,
  },
  emptyTitle: {
    fontWeight: "800",
  },
  emptyDesc: {
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },
});
