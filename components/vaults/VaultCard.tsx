import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Users } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { Pill } from "@/components/dashboard/primitives";
import { Card } from "@/components/ui/Card";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { DEFAULT_VAULT_COLOR, type SharedVault, type VaultStats } from "@/shared/types/vault";
import { vaultBudgetPresentation } from "@/shared/utils/vaultSpacePresentation";
import { useTheme } from "@/theme/ThemeProvider";

export interface VaultCardProps {
  vault: SharedVault;
  stats?: VaultStats | null;
  onPress: () => void;
}

/**
 * One shared vault in the hub list. SPENDLY-549: theme tokens and the
 * dashboard foundations; every amount respects ghost mode and the budget
 * state is a word as well as a colour. The accent strip is the vault's own
 * stored colour.
 */
export function VaultCard({ vault, stats, onPress }: VaultCardProps) {
  const { theme } = useTheme();
  const money = useGhostMoney(vault.currency);

  const themeColor = vault.themeColor || DEFAULT_VAULT_COLOR;
  const budget = stats ? vaultBudgetPresentation(stats.status) : null;

  return (
    <Card onPress={onPress} elevation={2} contentStyle={styles.cardContent} style={styles.card}>
      {/* The vault's own accent colour (user data). */}
      <View style={[styles.accentStrip, { backgroundColor: themeColor }]} />

      <View style={styles.body}>
        <View style={styles.titleCol}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.vaultName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
              numberOfLines={1}
            >
              {vault.name}
            </Text>
            {budget ? <Pill label={budget.label} tone={budget.tone} /> : null}
          </View>
          {vault.description ? (
            <Text style={[styles.vaultDesc, { color: theme.colors.mutedForeground }]} numberOfLines={1}>
              {vault.description}
            </Text>
          ) : null}
        </View>

        {stats ? (
          <>
            <View style={styles.metricsRow}>
              <View style={styles.metricBlock}>
                <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>Vault balance</Text>
                <FinancialAmount
                  value={stats.currentBalance}
                  currency={vault.currency}
                  size="lg"
                  weight="bold"
                  sign={stats.currentBalance < 0 ? "auto" : "none"}
                  tone={stats.currentBalance < 0 ? "negative" : "default"}
                />
              </View>
              <View style={[styles.metricBlock, { alignItems: "flex-end" }]}>
                <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>Budget</Text>
                <FinancialAmount value={vault.budget} currency={vault.currency} size="sm" tone="muted" />
              </View>
            </View>

            {vault.budget > 0 && budget ? (
              <ProgressIndicator
                pct={stats.budgetUsagePercent}
                status={budget.status}
                color={budget.status === "good" ? themeColor : undefined}
                statusLabel={`${budget.label} · ${money(stats.remainingBudget)} left`}
                trailing={`${stats.budgetUsagePercent}% spent`}
                accessibilityLabel={`${vault.name}: ${stats.budgetUsagePercent} percent of budget spent, ${budget.label}`}
              />
            ) : null}
          </>
        ) : null}

        <View style={[styles.cardFooter, { borderTopColor: theme.colors.border }]}>
          <View style={styles.footerLeft}>
            <Users size={14} color={theme.colors.mutedForeground} />
            <Text style={[styles.footerText, { color: theme.colors.mutedForeground }]}>
              {vault.memberIds?.length || 1} member{vault.memberIds?.length === 1 ? "" : "s"}
            </Text>
          </View>
          {stats ? (
            <Text style={[styles.footerText, { color: theme.colors.mutedForeground }]}>
              {stats.transactionCount} {stats.transactionCount === 1 ? "entry" : "entries"}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
  },
  cardContent: {
    padding: 0,
  },
  body: {
    padding: 16,
    gap: 12,
    paddingTop: 20,
  },
  accentStrip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  titleCol: {
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vaultName: {
    flexShrink: 1,
    fontSize: 16,
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
    fontSize: 11,
    fontWeight: "600",
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
  footerText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
