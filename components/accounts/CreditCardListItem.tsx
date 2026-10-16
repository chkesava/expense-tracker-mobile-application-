import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
  FilePlus2,
} from "lucide-react-native";

import { shadeCardAccent } from "@/components/accounts/accountScreenTheme";
import { LiabilityAmount } from "@/components/common/LiabilityAmount";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator, type ProgressStatus } from "@/components/dashboard/ProgressIndicator";
import { MetaLabel } from "@/components/dashboard/primitives";
import { useSettings } from "@/providers/SettingsProvider";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { creditUtilizationBand } from "@/shared/utils/creditCardPresentation";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

export type CreditCardRowModel = {
  id: string;
  name: string;
  identityLine: string;
  /** SPENDLY-436: set when `summaryReconciliationStatus === "needs_reconciliation"`. */
  reconciliationWarning: string | null;
  daysRemaining: number;
  /** False when the card has no bill date set — there is no real cycle to show. */
  billDayConfigured: boolean;
  /** Unbilled spend in the open cycle. */
  usedThisCycle: number;
  /** Owed under a cancelled statement — not this cycle, so it never eats the limit. */
  cancelledSpend?: number;
  /** Still owed on closed statements. */
  statementDue: number;
  outstanding: number;
  availableCredit: number;
  limit: number;
  utilization: number;
  accent: string;
  openBill: CreditCardBill | null;
};

/**
 * One credit card in the Cards section (SPENDLY-535).
 *
 * The body (identity, figures, utilisation, open statement) is one pressable
 * that opens the card; the actions live in a footer beside it. They used to be
 * pressables inside the card's pressable — buttons inside a button, which
 * React rejects on web and which made the presses compete on native. The card
 * keeps the user's own colour on its plastic; everything else is theme tokens.
 */
export const CreditCardListItem = memo(function CreditCardListItem({
  row,
  currency,
  onPress,
  onLongPress,
  onAddStatement,
  onPay,
}: {
  row: CreditCardRowModel;
  currency: string;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
  onAddStatement: (id: string) => void;
  onPay: (id: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const utilizationPercent = Math.round(Math.min(100, Math.max(0, row.utilization)));
  const band = creditUtilizationBand(utilizationPercent);
  const utilStatus: ProgressStatus =
    band.level === "high" ? "over" : band.level === "moderate" ? "watch" : "good";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.outlineVariant },
      ]}
    >
      <Pressable
        onPress={() => onPress(row.id)}
        onLongPress={() => onLongPress(row.id)}
        android_ripple={{ color: surfaces.track, borderless: false }}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${row.name}, ${utilizationPercent} percent used`}
      >
        <View style={styles.topRow}>
          <View style={styles.identity}>
            <LinearGradient
              colors={[row.accent, shadeCardAccent(row.accent)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.plastic}
            >
              <View style={styles.chip} />
              <CreditCard size={16} color="#FFFFFF" strokeWidth={2.2} />
            </LinearGradient>
            <View style={styles.copy}>
              <Text
                style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
                numberOfLines={1}
              >
                {row.name}
              </Text>
              <Text
                style={[styles.identityLine, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
                numberOfLines={1}
              >
                {row.identityLine}
              </Text>
              {row.reconciliationWarning ? (
                <View style={styles.warningRow}>
                  <AlertTriangle size={12} color={theme.colors.warning} strokeWidth={2.4} />
                  <Text
                    style={[styles.warningText, { color: theme.colors.warning, fontFamily: theme.fontFamily.medium }]}
                    numberOfLines={2}
                  >
                    {row.reconciliationWarning}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={[styles.resetBadge, { backgroundColor: surfaces.control }]}>
            <Calendar size={12} color={theme.colors.mutedForeground} />
            <Text style={[styles.resetText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
              {row.billDayConfigured ? `Resets in ${row.daysRemaining}d` : "Set bill date"}
            </Text>
          </View>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metricCol}>
            <MetaLabel>Outstanding</MetaLabel>
            {/* LiabilityAmount keeps its minus even with amounts hidden. */}
            <LiabilityAmount
              value={row.outstanding}
              currency={currency}
              ghostable
              style={[styles.metricValue, { fontFamily: theme.fontFamily.bold }]}
            />
          </View>
          <View style={[styles.metricCol, styles.metricRight]}>
            <MetaLabel>Available limit</MetaLabel>
            <FinancialAmount value={row.availableCredit} currency={currency} size="lg" weight="bold" tone="positive" />
          </View>
        </View>

        <View style={[styles.splitBox, { backgroundColor: surfaces.tile }]}>
          <SplitFigure label="Statement due" value={row.statementDue} currency={currency} />
          <SplitFigure label="Unbilled" value={row.usedThisCycle} currency={currency} />
          {row.cancelledSpend ? (
            <SplitFigure label="Cancelled" value={row.cancelledSpend} currency={currency} />
          ) : null}
        </View>

        <ProgressIndicator
          pct={utilizationPercent}
          status={utilStatus}
          statusLabel={`${band.word} utilisation`}
          trailing={`${utilizationPercent}% used`}
          accessibilityLabel={`${row.name} credit utilisation`}
        />

        {row.openBill ? (
          <View style={[styles.statement, { borderTopColor: surfaces.divider }]}>
            <MetaLabel>Statement · {row.openBill.status.replaceAll("_", " ").toLowerCase()}</MetaLabel>
            <View style={styles.statementRow}>
              <FinancialAmount value={row.openBill.statementAmount} currency={currency} size="md" weight="bold" />
              <Text style={[styles.due, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
                Due {formatDisplayDate(row.openBill.dueDate, settings.dateFormat)}
              </Text>
            </View>
            {row.openBill.minimumDueAmount > 0 ? (
              <View style={styles.statementRow}>
                <MetaLabel>Minimum due</MetaLabel>
                <FinancialAmount value={row.openBill.minimumDueAmount} currency={currency} size="sm" />
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      <View style={[styles.footer, { borderTopColor: surfaces.divider }]}>
        <View style={styles.limit}>
          <MetaLabel>Limit</MetaLabel>
          <FinancialAmount value={row.limit} currency={currency} size="xs" tone="muted" />
        </View>
        {row.openBill ? null : (
          <Pressable
            onPress={() => onAddStatement(row.id)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.footerBtn,
              { backgroundColor: surfaces.control },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Add statement bill for ${row.name}`}
          >
            <FilePlus2 size={13} color={theme.colors.foreground} />
            <Text style={[styles.footerLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              Statement
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => onPay(row.id)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.footerBtn,
            {
              backgroundColor: surfaces.wash(theme.colors.primary),
              borderColor: withAlpha(theme.colors.primary, 0.35),
              borderWidth: StyleSheet.hairlineWidth,
            },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${row.name} bill`}
        >
          <CheckCircle2 size={13} color={theme.colors.primary} />
          <Text style={[styles.footerLabel, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>
            Pay bill
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

function SplitFigure({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <View style={styles.splitFigure}>
      <MetaLabel>{label}</MetaLabel>
      <FinancialAmount value={value} currency={currency} size="sm" weight="semibold" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  body: {
    padding: 16,
    gap: 14,
  },
  pressed: {
    opacity: 0.88,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  plastic: {
    width: 48,
    height: 32,
    borderRadius: 7,
    padding: 5,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  chip: {
    alignSelf: "flex-start",
    width: 10,
    height: 7,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  identityLine: {
    fontSize: 12,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
  },
  resetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  resetText: {
    fontSize: 11,
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
  },
  metricCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  metricRight: {
    alignItems: "flex-end",
  },
  metricValue: {
    fontSize: 20,
  },
  splitBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  splitFigure: {
    flexGrow: 1,
    minWidth: 80,
    gap: 2,
  },
  statement: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  statementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  due: {
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  limit: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  footerLabel: {
    fontSize: 12.5,
  },
});
