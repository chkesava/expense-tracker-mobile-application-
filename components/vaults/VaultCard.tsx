import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, ShieldCheck, Users } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import type { SharedVault, VaultStats } from "@/shared/types/vault";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface VaultCardProps {
  vault: SharedVault;
  stats: VaultStats;
  onPress: () => void;
}

export function VaultCard({ vault, stats, onPress }: VaultCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const themeColor = vault.themeColor || "#6366F1";
  const progressRatio = Math.min(1, stats.budget > 0 ? stats.totalWithdrawals / stats.budget : 0);

  return (
    <Card
      style={[
        styles.card,
        {
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onPress();
        }}
        style={styles.pressable}
      >
        {/* Accent Top Strip */}
        <View style={[styles.accentStrip, { backgroundColor: themeColor }]} />

        <View style={styles.cardHeader}>
          <View style={styles.titleCol}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.vaultName, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {vault.name}
              </Text>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor:
                      stats.status === "healthy"
                        ? "rgba(34,197,94,0.15)"
                        : stats.status === "warning"
                        ? "rgba(245,158,11,0.15)"
                        : "rgba(239,68,68,0.15)",
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color:
                      stats.status === "healthy"
                        ? "#22C55E"
                        : stats.status === "warning"
                        ? "#F59E0B"
                        : "#EF4444",
                    textTransform: "uppercase",
                  }}
                >
                  {stats.status}
                </Text>
              </View>
            </View>

            {vault.description ? (
              <Text
                style={[styles.vaultDesc, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                {vault.description}
              </Text>
            ) : null}
          </View>

          <ChevronRight size={18} color={theme.colors.mutedForeground} />
        </View>

        {/* Balance & Budget Details */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              VAULT BALANCE
            </Text>
            <Amount
              value={stats.currentBalance}
              currency={vault.currency}
              style={{
                fontSize: 18,
                fontWeight: "900",
                color:
                  stats.currentBalance >= 0
                    ? theme.colors.foreground
                    : theme.colors.destructive,
              }}
            />
          </View>

          <View style={[styles.metricBlock, { alignItems: "flex-end" }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              BUDGET
            </Text>
            <Amount
              value={vault.budget}
              currency={vault.currency}
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: theme.colors.mutedForeground,
              }}
            />
          </View>
        </View>

        {/* Progress Bar */}
        {vault.budget > 0 && (
          <View style={styles.progressContainer}>
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
                    width: `${Math.round(progressRatio * 100)}%`,
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
                {stats.budgetUsagePercent}% spent
              </Text>
              <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                Remaining: {vault.currency} {stats.remainingBudget.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* Footer info: Members & Transaction Count */}
        <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
          <View style={styles.footerLeft}>
            <Users size={14} color={theme.colors.mutedForeground} />
            <Text style={{ fontSize: 12, color: theme.colors.mutedForeground, fontWeight: "600" }}>
              {vault.memberIds?.length || 1} Member{vault.memberIds?.length === 1 ? "" : "s"}
            </Text>
          </View>

          <Text style={{ fontSize: 12, color: theme.colors.mutedForeground }}>
            {stats.transactionCount} Activity
          </Text>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    borderRadius: 18,
    overflow: "hidden",
  },
  pressable: {
    padding: 16,
    gap: 12,
  },
  accentStrip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleCol: {
    flex: 1,
    gap: 2,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vaultName: {
    fontSize: 16,
    fontWeight: "800",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  vaultDesc: {
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricBlock: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  progressContainer: {
    gap: 6,
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
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
