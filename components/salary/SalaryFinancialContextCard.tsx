import React, { memo } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  FileSpreadsheet,
  PieChart,
  ShieldAlert,
  ArrowRight,
  Landmark,
} from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { Amount } from "@/components/common/Amount";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import { roundMoney } from "@/shared/utils/money";
import type { SalaryRecord } from "@/shared/features/salary";

export interface SalaryFinancialContextCardProps {
  latestRecord: SalaryRecord | null;
  monthlyBudget?: number;
  hasEpfEstablishment?: boolean;
  epfEstablishmentId?: string;
  taxCenterEnabled?: boolean;
}

/**
 * Broader Financial Context Insights (SPENDLY-334).
 * Connects salary intelligence to:
 * - Budget vs Net Income ratio
 * - EPF Statutory timeline
 * - Tax & ITR Section 192 TDS readiness
 * - Financial Calendar payday events
 * - Clear non-advisory legal disclaimer
 */
export const SalaryFinancialContextCard = memo(function SalaryFinancialContextCard({
  latestRecord,
  monthlyBudget = 0,
  hasEpfEstablishment = false,
  epfEstablishmentId,
  taxCenterEnabled = false,
}: SalaryFinancialContextCardProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();

  const netAmount = latestRecord?.netAmount ?? 0;
  const hasBudget = monthlyBudget > 0 && netAmount > 0;
  const budgetRatio = hasBudget ? Math.round((monthlyBudget / netAmount) * 100) : 0;
  const unallocatedAmount = hasBudget ? Math.max(0, roundMoney(netAmount - monthlyBudget)) : 0;

  return (
    <Card style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.iconWrap, { backgroundColor: surfaces.tile }]}>
            <PieChart size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.titleText}>
            <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              Financial Context & Linkages
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              How your regular salary coordinates with your broader plan
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* 1. Monthly Budget Alignment */}
      {hasBudget ? (
        <View style={[styles.sectionRow, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
              Monthly Budget vs Salary
            </Text>
            <View style={styles.amountWrap}>
              <Text style={[styles.badge, { color: theme.colors.primary, backgroundColor: theme.colors.primary + "18", fontFamily: theme.fontFamily.semibold }]}>
                {budgetRatio}% of Net Pay
              </Text>
            </View>
          </View>
          <Text style={[styles.sectionBody, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Your monthly budget of <Amount ghostable value={monthlyBudget} style={{ fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, color: theme.colors.foreground }} /> leaves approximately{" "}
            <Amount ghostable value={unallocatedAmount} style={{ fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, color: theme.colors.foreground }} /> uncommitted for savings, investments, or goal contributions.
          </Text>
        </View>
      ) : null}

      {/* 2. Connected Features Grid */}
      <View style={styles.linksGrid}>
        {/* EPF Link */}
        <Pressable
          onPress={() => router.push(epfEstablishmentId ? (`/epf/${epfEstablishmentId}` as never) : ("/investments?tab=epf" as never))}
          style={({ pressed }) => [
            styles.linkCard,
            {
              backgroundColor: pressed ? surfaces.tile : theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open EPF passbook"
        >
          <View style={styles.linkHeader}>
            <Landmark size={16} color={theme.colors.primary} />
            <Text style={[styles.linkLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
              EPFO Passbook
            </Text>
          </View>
          <Text style={[styles.linkDesc, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {hasEpfEstablishment
              ? "Statutory contributions sync with wage month remittances"
              : "Track statutory retirement deposits and employer match"}
          </Text>
          <View style={styles.arrowRow}>
            <Text style={[styles.linkAction, { color: theme.colors.primary, fontFamily: theme.fontFamily.medium }]}>
              View EPF
            </Text>
            <ArrowRight size={14} color={theme.colors.primary} />
          </View>
        </Pressable>

        {/* Tax & ITR Readiness Link */}
        <Pressable
          onPress={() => router.push("/tax" as never)}
          style={({ pressed }) => [
            styles.linkCard,
            {
              backgroundColor: pressed ? surfaces.tile : theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Tax Center"
        >
          <View style={styles.linkHeader}>
            <FileSpreadsheet size={16} color={theme.colors.primary} />
            <Text style={[styles.linkLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
              Tax & TDS Center
            </Text>
          </View>
          <Text style={[styles.linkDesc, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {taxCenterEnabled
              ? "Reconcile Section 192 TDS against Form 16 / 26AS records"
              : "Track TDS deductions and annual tax liability"}
          </Text>
          <View style={styles.arrowRow}>
            <Text style={[styles.linkAction, { color: theme.colors.primary, fontFamily: theme.fontFamily.medium }]}>
              Open Tax
            </Text>
            <ArrowRight size={14} color={theme.colors.primary} />
          </View>
        </Pressable>

        {/* Financial Calendar Link */}
        <Pressable
          onPress={() => router.push("/calendar" as never)}
          style={({ pressed }) => [
            styles.linkCard,
            {
              backgroundColor: pressed ? surfaces.tile : theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Financial Calendar"
        >
          <View style={styles.linkHeader}>
            <CalendarDays size={16} color={theme.colors.primary} />
            <Text style={[styles.linkLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
              Financial Calendar
            </Text>
          </View>
          <Text style={[styles.linkDesc, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            Expected paydays and arrival countdowns are scheduled on your cashflow calendar
          </Text>
          <View style={styles.arrowRow}>
            <Text style={[styles.linkAction, { color: theme.colors.primary, fontFamily: theme.fontFamily.medium }]}>
              View Calendar
            </Text>
            <ArrowRight size={14} color={theme.colors.primary} />
          </View>
        </Pressable>
      </View>

      {/* Non-advisory Legal Disclaimer */}
      <View style={[styles.disclaimerBox, { backgroundColor: surfaces.tile, borderRadius: theme.radius.sm }]}>
        <ShieldAlert size={14} color={theme.colors.mutedForeground} style={styles.disclaimerIcon} />
        <Text style={[styles.disclaimerText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          Spendly provides pure tracking based strictly on your confirmed transactions and user entries. This dashboard does not offer employment, legal, investment, or tax advice.
        </Text>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(150, 150, 150, 0.2)",
  },
  sectionRow: {
    padding: 12,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 13,
  },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  sectionBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  linksGrid: {
    gap: 10,
  },
  linkCard: {
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  linkHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkLabel: {
    fontSize: 13,
  },
  linkDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  arrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  linkAction: {
    fontSize: 12,
  },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 10,
    gap: 8,
  },
  disclaimerIcon: {
    marginTop: 2,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
});
