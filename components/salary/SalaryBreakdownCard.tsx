import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Info,
  ShieldCheck,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/providers/SettingsProvider";
import type { EpfContribution } from "@/shared/features/epf/types";
import type { SalaryRecord } from "@/shared/features/salary/types";
import {
  buildSalaryBreakdownWaterfall,
  type SalaryBreakdownItem,
  type SalaryEpfStatus,
  type SalaryReconciliationStatus,
} from "@/shared/features/salary/utils/breakdown";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { formatMonthName } from "@/shared/features/salary/utils/timeline";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface SalaryBreakdownCardProps {
  record: SalaryRecord;
  epfContributions?: EpfContribution[];
  onEditPayslip?: (record: SalaryRecord) => void;
  testID?: string;
}

export function SalaryBreakdownCard({
  record,
  epfContributions,
  onEditPayslip,
  testID,
}: SalaryBreakdownCardProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const router = useRouter();

  const waterfall = useMemo(
    () => buildSalaryBreakdownWaterfall(record, { epfContributions }),
    [record, epfContributions]
  );

  const formattedPaymentDate = formatDisplayDate(
    record.paymentDate,
    settings?.dateFormat
  );

  const wageMonthFormatted = waterfall.wageMonth
    ? formatMonthName(waterfall.wageMonth)
    : "Unspecified";

  return (
    <View
      style={[
        styles.cardContainer,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={testID}
    >
      {/* ── 1. Header & Reconciliation Badge ────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={[styles.employerName, { color: colors.foreground }]}>
            {record.employer.name}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            {wageMonthFormatted} • Paid {formattedPaymentDate}
          </Text>
        </View>
        <ReconciliationBadge status={waterfall.reconciliationStatus} diff={waterfall.discrepancyAmount} />
      </View>

      {/* ── 2. Top Waterfall Summary (Gross, Deductions, Net) ─────────────── */}
      <View
        style={[
          styles.waterfallSummary,
          { backgroundColor: surfaces.tile, borderColor: colors.border },
        ]}
      >
        <View style={styles.summaryColumn}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Gross Pay {waterfall.isGrossCalculated ? "(est.)" : ""}
          </Text>
          {waterfall.grossSalary != null ? (
            <Amount
              value={waterfall.grossSalary}
              currency="INR"
              style={[styles.summaryValue, { color: colors.foreground }]}
            />
          ) : (
            <Text style={[styles.summaryValueMuted, { color: colors.mutedForeground }]}>
              —
            </Text>
          )}
        </View>

        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

        <View style={styles.summaryColumn}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Deductions
          </Text>
          {waterfall.totalDeductions > 0 ? (
            <Amount
              value={waterfall.totalDeductions}
              currency="INR"
              style={[styles.summaryValue, { color: colors.destructive }]}
            />
          ) : (
            <Text style={[styles.summaryValueMuted, { color: colors.mutedForeground }]}>
              —
            </Text>
          )}
        </View>

        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

        <View style={styles.summaryColumn}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Net Take-Home
          </Text>
          <Amount
            value={waterfall.netSalary}
            currency="INR"
            style={[styles.summaryValueNet, { color: colors.primary }]}
          />
        </View>
      </View>

      {/* ── 3. Discrepancy Callout (if any) ───────────────────────────────── */}
      {waterfall.reconciliationStatus === "discrepancy" && waterfall.discrepancyAmount != null ? (
        <View style={[styles.discrepancyBox, { borderColor: "#f59e0b" }]}>
          <AlertTriangle size={18} color="#f59e0b" />
          <View style={styles.discrepancyContent}>
            <Text style={styles.discrepancyTitle}>
              Mathematical Discrepancy Detected
            </Text>
            <Text style={[styles.discrepancyDesc, { color: colors.mutedForeground }]}>
              Gross pay minus deductions yields an expected net of{" "}
              {waterfall.grossSalary != null && (
                <Amount
                  value={waterfall.grossSalary - waterfall.totalDeductions}
                  currency="INR"
                  style={styles.discrepancyAmountInline}
                />
              )}
              , differing from the actual net credit by{" "}
              <Amount
                value={Math.abs(waterfall.discrepancyAmount)}
                currency="INR"
                style={styles.discrepancyAmountInline}
              />
              .
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── 4. Earnings & Allowances ─────────────────────────────────────── */}
      {waterfall.earningsItems.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ArrowUpRight size={16} color="#10b981" />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Earnings & Allowances
            </Text>
          </View>

          <View style={styles.itemsList}>
            {waterfall.earningsItems.map((item) => (
              <BreakdownItemRow
                key={item.key}
                item={item}
                prefix="+"
                valueColor="#10b981"
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* ── 5. Statutory Deductions (EPF, TDS, PT) ───────────────────────── */}
      {waterfall.deductionsItems.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ArrowDownRight size={16} color={colors.destructive} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Statutory Deductions
            </Text>
          </View>

          <View style={styles.itemsList}>
            {waterfall.deductionsItems.map((item) => (
              <View key={item.key} style={styles.deductionRowWrapper}>
                <BreakdownItemRow
                  item={item}
                  prefix="-"
                  valueColor={colors.destructive}
                />

                {/* EPF Statutory Status Sub-card */}
                {item.key === "epf" && waterfall.epfAnalysis ? (
                  <View
                    style={[
                      styles.statutorySubCard,
                      {
                        backgroundColor: surfaces.tile,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.statutoryHeader}>
                      <EpfStatusBadge status={waterfall.epfAnalysis.status} />
                      <Pressable
                        style={styles.deepLinkButton}
                        onPress={() => {
                          if (waterfall.epfAnalysis?.deepLink) {
                            router.push(waterfall.epfAnalysis.deepLink as any);
                          }
                        }}
                      >
                        <Text style={[styles.deepLinkText, { color: colors.primary }]}>
                          EPF Ledger
                        </Text>
                        <ChevronRight size={14} color={colors.primary} />
                      </Pressable>
                    </View>
                    <Text
                      style={[
                        styles.statutoryDescription,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {waterfall.epfAnalysis.statusDescription}
                    </Text>
                  </View>
                ) : null}

                {/* TDS Tax Sub-card */}
                {item.key === "tds" && waterfall.taxAnalysis ? (
                  <View
                    style={[
                      styles.statutorySubCard,
                      {
                        backgroundColor: surfaces.tile,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.statutoryHeader}>
                      <View style={styles.taxBadge}>
                        <ExternalLink size={12} color={colors.primary} />
                        <Text
                          style={[styles.taxBadgeText, { color: colors.primary }]}
                        >
                          Section 192 • {waterfall.taxAnalysis.financialYearLabel}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.deepLinkButton}
                        onPress={() => {
                          if (waterfall.taxAnalysis?.deepLink) {
                            router.push(waterfall.taxAnalysis.deepLink as any);
                          }
                        }}
                      >
                        <Text style={[styles.deepLinkText, { color: colors.primary }]}>
                          Tax Center
                        </Text>
                        <ChevronRight size={14} color={colors.primary} />
                      </Pressable>
                    </View>
                    <Text
                      style={[
                        styles.statutoryDescription,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {waterfall.taxAnalysis.statusDescription}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── 6. Net Only Fallback State ───────────────────────────────────── */}
      {waterfall.isNetOnly ? (
        <View
          style={[
            styles.netOnlyCard,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <FileSpreadsheet size={28} color={colors.mutedForeground} />
          <View style={styles.netOnlyContent}>
            <Text style={[styles.netOnlyTitle, { color: colors.foreground }]}>
              Payslip Breakdown Unavailable
            </Text>
            <Text style={[styles.netOnlySubtitle, { color: colors.mutedForeground }]}>
              Only the net bank deposit of{" "}
              <Amount
                value={waterfall.netSalary}
                currency="INR"
                style={styles.netOnlyAmountInline}
              />{" "}
              was recorded from bank transactions. Add your payslip details to track
              Basic, HRA, EPF, and TDS deductions.
            </Text>
            {onEditPayslip ? (
              <Button
                variant="outline"
                size="sm"
                onPress={() => onEditPayslip(record)}
                style={styles.addBreakdownButton}
              >
                Add Payslip Details
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function BreakdownItemRow({
  item,
  prefix,
  valueColor,
}: {
  item: SalaryBreakdownItem;
  prefix: "+" | "-";
  valueColor: string;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <View style={styles.itemLabelRow}>
          <Text style={[styles.itemLabel, { color: colors.foreground }]}>
            {item.label}
          </Text>
          {item.isCalculated ? (
            <View style={styles.calculatedPill}>
              <Text style={styles.calculatedPillText}>Calculated</Text>
            </View>
          ) : null}
        </View>
        {item.description ? (
          <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.itemAmountPrefix, { color: valueColor }]}>{prefix}</Text>
        <Amount
          value={item.amount}
          currency="INR"
          style={[styles.itemAmountValue, { color: valueColor }]}
        />
      </View>
    </View>
  );
}

function ReconciliationBadge({
  status,
  diff,
}: {
  status: SalaryReconciliationStatus;
  diff?: number;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  if (status === "reconciled") {
    return (
      <View style={[styles.badgeBase, { backgroundColor: "rgba(16, 185, 129, 0.12)" }]}>
        <CheckCircle2 size={12} color="#10b981" />
        <Text style={[styles.badgeText, { color: "#10b981" }]}>Reconciled</Text>
      </View>
    );
  }

  if (status === "discrepancy") {
    return (
      <View style={[styles.badgeBase, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
        <AlertTriangle size={12} color="#f59e0b" />
        <Text style={[styles.badgeText, { color: "#f59e0b" }]}>
          Diff {diff != null ? `₹${Math.abs(Math.round(diff))}` : ""}
        </Text>
      </View>
    );
  }

  if (status === "partial") {
    return (
      <View style={[styles.badgeBase, { backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
        <Info size={12} color="#3b82f6" />
        <Text style={[styles.badgeText, { color: "#3b82f6" }]}>Partial</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badgeBase, { backgroundColor: colors.muted }]}>
      <FileText size={12} color={colors.mutedForeground} />
      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Net Only</Text>
    </View>
  );
}

function EpfStatusBadge({ status }: { status: SalaryEpfStatus }) {
  if (status === "deposited") {
    return (
      <View style={[styles.epfBadge, { backgroundColor: "rgba(16, 185, 129, 0.12)" }]}>
        <ShieldCheck size={12} color="#10b981" />
        <Text style={[styles.epfBadgeText, { color: "#10b981" }]}>
          Deposited to EPFO
        </Text>
      </View>
    );
  }

  if (status === "awaiting_deposit") {
    return (
      <View style={[styles.epfBadge, { backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
        <Info size={12} color="#3b82f6" />
        <Text style={[styles.epfBadgeText, { color: "#3b82f6" }]}>
          Awaiting Deposit
        </Text>
      </View>
    );
  }

  if (status === "overdue") {
    return (
      <View style={[styles.epfBadge, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}>
        <AlertCircle size={12} color="#ef4444" />
        <Text style={[styles.epfBadgeText, { color: "#ef4444" }]}>
          Deposit Overdue
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.epfBadge, { backgroundColor: "rgba(107, 114, 128, 0.12)" }]}>
      <Text style={[styles.epfBadgeText, { color: "#6b7280" }]}>Not Deducted</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitles: {
    flex: 1,
    gap: 2,
  },
  employerName: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerSubtitle: {
    fontSize: 13,
  },
  badgeBase: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  waterfallSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryColumn: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  summaryValueMuted: {
    fontSize: 15,
    fontWeight: "600",
  },
  summaryValueNet: {
    fontSize: 16,
    fontWeight: "800",
  },
  discrepancyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
  },
  discrepancyContent: {
    flex: 1,
    gap: 2,
  },
  discrepancyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#d97706",
  },
  discrepancyDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  discrepancyAmountInline: {
    fontWeight: "700",
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  itemLeft: {
    flex: 1,
    gap: 2,
  },
  itemLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  itemDesc: {
    fontSize: 12,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  itemAmountPrefix: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemAmountValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  calculatedPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
  },
  calculatedPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#3b82f6",
  },
  deductionRowWrapper: {
    gap: 6,
  },
  statutorySubCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    gap: 4,
    marginLeft: 12,
  },
  statutoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  epfBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  epfBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  taxBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  taxBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  deepLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  deepLinkText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statutoryDescription: {
    fontSize: 11,
    lineHeight: 15,
  },
  netOnlyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  netOnlyContent: {
    flex: 1,
    gap: 6,
  },
  netOnlyTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  netOnlySubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  netOnlyAmountInline: {
    fontWeight: "700",
  },
  addBreakdownButton: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
});
