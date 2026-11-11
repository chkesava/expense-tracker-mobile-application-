import React, { memo } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import {
  Building2,
  Calendar,
  Sparkles,
  TrendingUp,
  Receipt,
  Plus,
} from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import type { SalaryRecord } from "@/shared/features/salary";
import { formatMonthName } from "@/shared/features/salary/utils/timeline";

export interface SalaryHeaderSummaryProps {
  latestRecord: SalaryRecord | null;
  primaryEmployer: string;
  totalBonusPast12Months?: number;
  pendingCandidatesCount?: number;
  onOpenReviews?: () => void;
  onAddManualRecord?: () => void;
}

/**
 * Primary Hero Summary for Salary Intelligence (SPENDLY-334).
 * Displays current regular net pay, gross where known, latest wage period,
 * recent variable pay, and action triggers.
 */
export const SalaryHeaderSummary = memo(function SalaryHeaderSummary({
  latestRecord,
  primaryEmployer,
  totalBonusPast12Months = 0,
  pendingCandidatesCount = 0,
  onOpenReviews,
  onAddManualRecord,
}: SalaryHeaderSummaryProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const netAmount = latestRecord?.netAmount ?? 0;
  const grossAmount = latestRecord?.grossAmount;
  const latestMonth = latestRecord?.payPeriod?.month || latestRecord?.month || "";
  const paymentDate = latestRecord?.paymentDate || "";

  return (
    <Card style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
      {/* Review Candidates Callout Banner (if candidates need review) */}
      {pendingCandidatesCount > 0 && onOpenReviews ? (
        <Pressable
          onPress={onOpenReviews}
          style={({ pressed }) => [
            styles.reviewBanner,
            {
              backgroundColor: theme.colors.primary + "15",
              borderColor: theme.colors.primary + "40",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Review ${pendingCandidatesCount} detected salary candidate transactions`}
        >
          <Sparkles size={16} color={theme.colors.primary} />
          <Text style={[styles.reviewBannerText, { color: theme.colors.primary, fontFamily: theme.fontFamily.medium }]}>
            {pendingCandidatesCount} possible salary {pendingCandidatesCount === 1 ? "deposit" : "deposits"} detected
          </Text>
          <Text style={[styles.reviewBannerAction, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>
            Review
          </Text>
        </Pressable>
      ) : null}

      {/* Main Net Pay Display */}
      <View style={styles.topSection}>
        <View style={styles.employerRow}>
          <Building2 size={16} color={theme.colors.mutedForeground} />
          <Text style={[styles.employerName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            {primaryEmployer}
          </Text>
          {latestRecord?.status === "confirmed" ? (
            <View style={[styles.badgeConfirmed, { backgroundColor: theme.colors.success + "18" }]}>
              <Text style={[styles.badgeConfirmedText, { color: theme.colors.success, fontFamily: theme.fontFamily.medium }]}>
                Confirmed
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          Current Regular Net Pay
        </Text>

        <View style={styles.amountRow}>
          <Amount value={netAmount} style={{ fontSize: theme.typography.xxl, fontFamily: theme.fontFamily.bold, color: theme.colors.foreground }} />
          {grossAmount && grossAmount > netAmount ? (
            <View style={[styles.grossPill, { backgroundColor: surfaces.tile }]}>
              <Receipt size={12} color={theme.colors.mutedForeground} />
              <Text style={[styles.grossText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                Gross <Amount value={grossAmount} style={{ fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium, color: theme.colors.mutedForeground }} />
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Month & Recency Meta */}
      {latestMonth ? (
        <View style={[styles.metaRow, { backgroundColor: surfaces.tile, borderRadius: theme.radius.sm }]}>
          <View style={styles.metaItem}>
            <Calendar size={13} color={theme.colors.mutedForeground} />
            <Text style={[styles.metaText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              Wage Month: <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }}>{formatMonthName(latestMonth)}</Text>
            </Text>
          </View>
          {paymentDate ? (
            <Text style={[styles.metaSubtext, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              Credited {paymentDate}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Variable Pay Context (if user had bonuses in past 12 mo) */}
      {totalBonusPast12Months > 0 ? (
        <View style={[styles.bonusBanner, { backgroundColor: surfaces.tile, borderRadius: theme.radius.sm }]}>
          <TrendingUp size={14} color={theme.colors.primary} />
          <Text style={[styles.bonusText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular }]}>
            <Text style={{ fontFamily: theme.fontFamily.semibold }}>
              +<Amount value={totalBonusPast12Months} style={{ fontSize: theme.typography.xs, fontFamily: theme.fontFamily.semibold, color: theme.colors.foreground }} />
            </Text>{" "}
            variable pay / bonuses received in past 12 months
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  reviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  reviewBannerText: {
    flex: 1,
    fontSize: 13,
  },
  reviewBannerAction: {
    fontSize: 13,
  },
  topSection: {
    gap: 4,
  },
  employerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  employerName: {
    fontSize: 14,
  },
  badgeConfirmed: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  badgeConfirmedText: {
    fontSize: 10,
  },
  label: {
    fontSize: 12,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    flexWrap: "wrap",
    gap: 8,
  },
  grossPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  grossText: {
    fontSize: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
  metaSubtext: {
    fontSize: 11,
  },
  bonusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bonusText: {
    fontSize: 12,
    flex: 1,
  },
});
