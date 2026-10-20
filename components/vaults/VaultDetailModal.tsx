import { appDialog } from "@/lib/appDialog";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VaultTransactionModal } from "@/components/vaults/VaultTransactionModal";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useVaultExpenses } from "@/hooks/useVaultExpenses";
import { useAuth } from "@/providers/AuthProvider";
import { DEFAULT_VAULT_COLOR, type SharedVault } from "@/shared/types/vault";
import {
  calculateMemberSpending,
  calculateVaultStats,
} from "@/shared/utils/vaultMath";
import { vaultBudgetPresentation } from "@/shared/utils/vaultSpacePresentation";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";

export interface VaultDetailModalProps {
  visible: boolean;
  vault: SharedVault | null;
  onClose: () => void;
  onDeleteVault: (id: string) => Promise<boolean>;
}

export function VaultDetailModal({
  visible,
  vault,
  onClose,
  onDeleteVault,
}: VaultDetailModalProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { user } = useAuth();

  const vaultId = vault?.id;
  const { expenses, loading, addVaultExpense, deleteVaultExpense } =
    useVaultExpenses(vaultId);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const money = useGhostMoney(vault?.currency ?? "INR");

  const stats = useMemo(() => {
    if (!vault) return null;
    return calculateVaultStats(vault, expenses);
  }, [vault, expenses]);

  const memberContributions = useMemo(() => {
    return calculateMemberSpending(expenses);
  }, [expenses]);

  if (!vault || !stats) return null;

  const isOwner = user?.uid === vault.ownerId;
  const themeColor = vault.themeColor || DEFAULT_VAULT_COLOR;
  const budget = vaultBudgetPresentation(stats.status);

  const handleDelete = () => {
    appDialog.alert(
      "Delete Vault",
      `Are you sure you want to delete "${vault.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (vault.id) {
              await onDeleteVault(vault.id);
              onClose();
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Modal
        isOpen={visible}
        onClose={onClose}
        title={vault.name}
        maxHeight="90%"
        // SPENDLY-549: the primary action is pinned (6a form sheet pattern).
        footer={
          <SheetActions
            primary={{
              label: "Add transaction",
              onPress: () => {
                haptic.selection().catch(() => undefined);
                setIsTxModalOpen(true);
              },
            }}
          />
        }
      >
        {/* Identity */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: withAlpha(themeColor, 0.13) },
              ]}
            >
              <Wallet size={20} color={themeColor} />
            </View>
            <Text
              style={[styles.subtitle, { color: theme.colors.mutedForeground, flex: 1 }]}
              numberOfLines={2}
            >
              {vault.description || "Shared Vault Overview"}
            </Text>
          </View>

          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              onPress={handleDelete}
              accessibilityLabel="Delete vault"
            >
              <Trash2 size={18} color={theme.colors.destructive} />
            </Button>
          )}
        </View>

        {/* Balance & Budget Card */}
        <Card style={styles.statsCard}>
          <View style={styles.statRow}>
            <View>
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                Available balance
              </Text>
              <FinancialAmount
                value={stats.currentBalance}
                currency={vault.currency}
                size="xl"
                weight="bold"
                sign={stats.currentBalance < 0 ? "auto" : "none"}
                tone={stats.currentBalance < 0 ? "negative" : "default"}
              />
            </View>

            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                Budget limit
              </Text>
              <FinancialAmount value={vault.budget} currency={vault.currency} size="md" weight="semibold" />
            </View>
          </View>

          {/* Progress: a status word as well as a colour. */}
          {vault.budget > 0 && (
            <ProgressIndicator
              pct={stats.budgetUsagePercent}
              status={budget.status}
              color={budget.status === "good" ? themeColor : undefined}
              value={`${money(stats.totalWithdrawals)} spent`}
              statusLabel={`${budget.label} · ${money(stats.remainingBudget)} left`}
              trailing={`${stats.budgetUsagePercent}%`}
              accessibilityLabel={`${stats.budgetUsagePercent} percent of the budget spent, ${budget.label}`}
            />
          )}
        </Card>

        {/* Member Contributions Breakdown */}
        {memberContributions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
              Member contributions
            </Text>
            <Card style={styles.membersCard}>
              {memberContributions.map((m, idx) => (
                <View
                  key={m.userId}
                  style={[
                    styles.memberRow,
                    idx > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: theme.colors.foreground }]}>
                      {m.userName || `Member (${m.userId.slice(0, 5)})`}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                      Deposited {money(m.totalDeposited)} · Spent {money(m.totalWithdrawn)}
                    </Text>
                  </View>
                  <FinancialAmount
                    value={m.netContribution}
                    currency={vault.currency}
                    size="sm"
                    weight="bold"
                    sign="auto"
                    tone="auto"
                  />
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Transactions Activity List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
              Activity ({expenses.length})
            </Text>
          </View>

          {expenses.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={{ fontSize: 13, color: theme.colors.mutedForeground, textAlign: "center" }}>
                No transactions recorded yet in this vault.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              {expenses.map((e) => (
                <Card key={e.id} style={styles.txCard}>
                  <View style={styles.txRow}>
                    <View
                      style={[
                        styles.txIconCircle,
                        {
                          backgroundColor: surfaces.wash(
                            e.type === "deposit" ? theme.colors.success : theme.colors.destructive
                          ),
                        },
                      ]}
                    >
                      {e.type === "deposit" ? (
                        <ArrowDownLeft size={16} color={theme.colors.success} />
                      ) : (
                        <ArrowUpRight size={16} color={theme.colors.destructive} />
                      )}
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.txCategory, { color: theme.colors.foreground }]}>
                        {e.category || (e.type === "deposit" ? "Deposit" : "Expense")}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                        {e.createdByName ? `${e.createdByName} • ` : ""}{e.date}
                        {e.note ? ` • ${e.note}` : ""}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {/* In or out reads from the sign, not the colour alone. */}
                      <FinancialAmount
                        value={e.type === "deposit" ? e.amount : -e.amount}
                        currency={vault.currency}
                        size="sm"
                        weight="bold"
                        sign="auto"
                        tone="auto"
                      />
                      {e.id && (isOwner || e.createdBy === user?.uid) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          haptic={false}
                          onPress={() => deleteVaultExpense(e.id!)}
                          accessibilityLabel="Delete vault entry"
                          style={{ minHeight: 28, paddingHorizontal: 8, paddingVertical: 2 }}
                        >
                          <Text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>
                            Delete
                          </Text>
                        </Button>
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

      </Modal>

      {/* Transaction Modal — a sibling, so it stacks above the sheet. */}
      <VaultTransactionModal
        visible={isTxModalOpen}
        vault={vault}
        onClose={() => setIsTxModalOpen(false)}
        onSubmit={addVaultExpense}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 12,
  },
  statsCard: {
    padding: 16,
    borderRadius: 18,
    gap: 10,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  section: {
    gap: 8,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  membersCard: {
    padding: 12,
    borderRadius: 16,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  txCard: {
    padding: 12,
    borderRadius: 14,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  txIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txCategory: {
    fontSize: 13,
    fontWeight: "700",
  },
});
