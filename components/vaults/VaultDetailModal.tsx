import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VaultTransactionModal } from "@/components/vaults/VaultTransactionModal";
import { useVaultExpenses } from "@/hooks/useVaultExpenses";
import { useAuth } from "@/providers/AuthProvider";
import type { SharedVault } from "@/shared/types/vault";
import {
  calculateMemberSpending,
  calculateVaultStats,
} from "@/shared/utils/vaultMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();

  const vaultId = vault?.id;
  const { expenses, loading, addVaultExpense, deleteVaultExpense } =
    useVaultExpenses(vaultId);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);

  const stats = useMemo(() => {
    if (!vault) return null;
    return calculateVaultStats(vault, expenses);
  }, [vault, expenses]);

  const memberContributions = useMemo(() => {
    return calculateMemberSpending(expenses);
  }, [expenses]);

  if (!vault || !stats) return null;

  const isOwner = user?.uid === vault.ownerId;
  const themeColor = vault.themeColor || "#6366F1";

  const handleDelete = () => {
    Alert.alert(
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${themeColor}20` },
                ]}
              >
                <Wallet size={20} color={themeColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.title, { color: theme.colors.foreground }]}
                  numberOfLines={1}
                >
                  {vault.name}
                </Text>
                <Text
                  style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {vault.description || "Shared Vault Overview"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {isOwner && (
                <Pressable
                  onPress={handleDelete}
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                >
                  <Trash2 size={18} color={theme.colors.destructive} />
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              >
                <X size={20} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Balance & Budget Card */}
            <Card style={styles.statsCard}>
              <View style={styles.statRow}>
                <View>
                  <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                    AVAILABLE BALANCE
                  </Text>
                  <Amount
                    value={stats.currentBalance}
                    currency={vault.currency}
                    style={{
                      fontSize: 22,
                      fontWeight: "900",
                      color:
                        stats.currentBalance >= 0
                          ? theme.colors.foreground
                          : theme.colors.destructive,
                    }}
                  />
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                    BUDGET LIMIT
                  </Text>
                  <Amount
                    value={vault.budget}
                    currency={vault.currency}
                    style={{ fontSize: 16, fontWeight: "700", color: theme.colors.foreground }}
                  />
                </View>
              </View>

              {/* Progress */}
              {vault.budget > 0 && (
                <View style={{ gap: 6, marginTop: 4 }}>
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
                          width: `${Math.min(100, stats.budgetUsagePercent)}%`,
                          backgroundColor:
                            stats.status === "healthy"
                              ? themeColor
                              : stats.status === "warning"
                              ? "#F59E0B"
                              : "#EF4444",
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.progressInfo}>
                    <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                      Spent: {vault.currency} {stats.totalWithdrawals.toLocaleString()} ({stats.budgetUsagePercent}%)
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                      Remaining: {vault.currency} {stats.remainingBudget.toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </Card>

            {/* Member Contributions Breakdown */}
            {memberContributions.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                  MEMBER CONTRIBUTIONS
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
                          Deposited: {vault.currency} {m.totalDeposited.toLocaleString()} • Spent: {vault.currency} {m.totalWithdrawn.toLocaleString()}
                        </Text>
                      </View>
                      <Amount
                        value={m.netContribution}
                        currency={vault.currency}
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color: m.netContribution >= 0 ? "#22C55E" : theme.colors.destructive,
                        }}
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
                  ACTIVITY & TRANSACTIONS ({expenses.length})
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
                              backgroundColor:
                                e.type === "deposit"
                                  ? "rgba(34,197,94,0.15)"
                                  : "rgba(239,68,68,0.15)",
                            },
                          ]}
                        >
                          {e.type === "deposit" ? (
                            <ArrowDownLeft size={16} color="#22C55E" />
                          ) : (
                            <ArrowUpRight size={16} color="#EF4444" />
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
                          <Amount
                            value={e.amount}
                            currency={vault.currency}
                            style={{
                              fontSize: 14,
                              fontWeight: "800",
                              color:
                                e.type === "deposit"
                                  ? "#22C55E"
                                  : theme.colors.destructive,
                            }}
                          />
                          {e.id && (
                            <Pressable
                              onPress={() => deleteVaultExpense(e.id!)}
                              style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                            >
                              <Text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>
                                Delete
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setIsTxModalOpen(true);
              }}
              style={{ flex: 1 }}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
                Add Transaction
              </Text>
            </Button>
          </View>
        </View>
      </View>

      {/* Transaction Modal */}
      <VaultTransactionModal
        visible={isTxModalOpen}
        vault={vault}
        onClose={() => setIsTxModalOpen(false)}
        onSubmit={addVaultExpense}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
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
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  iconBtn: {
    padding: 6,
  },
  body: {
    paddingHorizontal: 20,
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  progressInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
