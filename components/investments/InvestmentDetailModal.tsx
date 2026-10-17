import { appDialog } from "@/lib/appDialog";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Archive,
  Calendar,
  Percent,
  Trash2,
} from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Pill } from "@/components/dashboard/primitives";
import { useInvestmentKindStyle } from "@/components/investments/investmentKind";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import {
  formatSignedPercent,
  investmentReturnPercent,
  investmentStatusDisplay,
} from "@/shared/utils/investmentPresentation";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Investment } from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

export interface InvestmentDetailModalProps {
  visible: boolean;
  investment: Investment | null;
  currency: string;
  onClose: () => void;
  onCloseInvestment: (id: string) => Promise<boolean>;
  onDeleteInvestment: (id: string) => Promise<boolean>;
}

export function InvestmentDetailModal({
  visible,
  investment,
  currency,
  onClose,
  onCloseInvestment,
  onDeleteInvestment,
}: InvestmentDetailModalProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  // Hooks run before the early return below; the kind is a placeholder
  // while no investment is selected.
  const kind = useInvestmentKindStyle(investment?.kind ?? "fixed_deposit");
  const date = (value: string) => formatDisplayDate(value, settings?.dateFormat);

  const today = todayDateKey();
  const valuation = useMemo(() => {
    if (!investment) return null;
    return getInvestmentValuation(investment, today);
  }, [investment, today]);

  if (!investment || !valuation) return null;

  const isClosed = investment.status === "closed";
  const profit = valuation.totalValue - investment.principal;
  const returnPct = investmentReturnPercent(profit, investment.principal);
  const kindLabel = kind.label;
  const kindColor = kind.color;

  const handleDelete = () => {
    appDialog.alert(
      "Delete Investment",
      `Are you sure you want to delete "${investment.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await onDeleteInvestment(investment.id);
            onClose();
          },
        },
      ]
    );
  };

  const handleClose = () => {
    appDialog.alert(
      "Maturity / Close Investment",
      `Mark "${investment.name}" as closed? It will remain in historical records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Closed",
          onPress: async () => {
            await onCloseInvestment(investment.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal isOpen={visible} onClose={onClose} title={investment.name} maxHeight="85%">
      {/* Identity */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: withAlpha(kindColor, 0.13) },
            ]}
          >
            <kind.Icon size={20} color={kindColor} />
          </View>
          <Text
            style={[styles.subtitle, { color: theme.colors.mutedForeground, flex: 1 }]}
            numberOfLines={2}
          >
            {kindLabel} · Started {date(investment.startDate)}
          </Text>
        </View>

        <Button
          variant="ghost"
          size="icon"
          onPress={handleDelete}
          accessibilityLabel="Delete investment"
        >
          <Trash2 size={18} color={theme.colors.destructive} />
        </Button>
      </View>

      {/* Big Valuation Card */}
      <Card style={styles.valuationCard}>
        <MetaLabel>Current value · as of today</MetaLabel>
        <FinancialAmount value={valuation.totalValue} currency={currency} size="xl" weight="bold" fit />

        <View
          style={[
            styles.subMetricsRow,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <View style={styles.subMetric}>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Principal Invested
            </Text>
            <FinancialAmount value={investment.principal} currency={currency} size="sm" weight="semibold" />
          </View>

          <View style={[styles.subMetric, { alignItems: "flex-end" }]}>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Accrued Gain / Interest
            </Text>
            {/* SPENDLY-542: this always printed "+", so a loss read "+INR -500". */}
            <FinancialAmount
              value={Math.round(profit)}
              currency={currency}
              size="sm"
              sign="auto"
              tone="auto"
              weight="semibold"
            />
            {returnPct !== null ? (
              <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                {formatSignedPercent(returnPct)} on principal
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Terms & Configuration */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
          INVESTMENT SPECIFICATIONS
        </Text>

        <Card style={{ padding: 14 }}>
          <View style={styles.specs}>
            <View style={styles.specRow}>
              <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                Interest Rate
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                {investment.annualInterestRate !== undefined
                  ? `${investment.annualInterestRate}% p.a.`
                  : "Market Linked"}
              </Text>
            </View>

            {investment.interestMethod && (
              <View style={styles.specRow}>
                <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                  Calculation Method
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground, textTransform: "capitalize" }}>
                  {investment.interestMethod} ({investment.creditFrequency || "Quarterly"})
                </Text>
              </View>
            )}

            {investment.maturityDate && (
              <View style={styles.specRow}>
                <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                  Maturity Date
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                  {date(investment.maturityDate)}
                </Text>
              </View>
            )}

            <View style={styles.specRow}>
              <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                Status
              </Text>
              <Pill label={investmentStatusDisplay(investment.status).label} tone={investmentStatusDisplay(investment.status).tone} />
            </View>
          </View>
        </Card>
      </View>

      {/* Footer Action */}
      {!isClosed && (
        <Button variant="outline" onPress={handleClose}>
          <Archive size={16} color={theme.colors.primary} />
          <Text style={{ marginLeft: 8, fontWeight: "700", color: theme.colors.primary }}>
            Mark as Matured / Closed
          </Text>
        </Button>
      )}
    </Modal>
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
  valuationCard: {
    padding: 18,
    borderRadius: 18,
    gap: 8,
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subMetric: {
    gap: 2,
  },
  section: {
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  specs: {
    gap: 12,
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
