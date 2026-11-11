import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertTriangle,
  ArrowUpRight,
  Building,
  Calendar,
  ChevronRight,
  FileText,
  Filter,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Chip } from "@/components/ui/Chip";
import { useSettings } from "@/providers/SettingsProvider";
import type {
  SalaryRecord,
  SalaryType,
} from "@/shared/features/salary/types";
import {
  buildSalaryTimeline,
  formatMonthName,
  type MonthlyPaycheckGroup,
  type SalaryPaycheckTimelineItem,
  type SalaryTimelineFilters,
} from "@/shared/features/salary/utils/timeline";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface PaycheckTimelineProps {
  records: SalaryRecord[];
  onSelectRecord?: (record: SalaryRecord) => void;
  onSelectMissingPaycheck?: (month: string, employerName: string) => void;
}

export function PaycheckTimeline({
  records,
  onSelectRecord,
  onSelectMissingPaycheck,
}: PaycheckTimelineProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedClassification, setSelectedClassification] =
    useState<SalaryType | "ALL">("ALL");
  const [selectedEmployer, setSelectedEmployer] = useState<string>("ALL");

  const filters = useMemo<SalaryTimelineFilters>(
    () => ({
      year: selectedYear,
      employerName: selectedEmployer,
      classification: selectedClassification,
    }),
    [selectedYear, selectedEmployer, selectedClassification]
  );

  const { groups, summary } = useMemo(
    () => buildSalaryTimeline(records, { filters }),
    [records, filters]
  );

  const availableYears = summary.availableYears;
  const availableEmployers = summary.employers;

  return (
    <View style={styles.container}>
      {/* ── Summary Overview Card ────────────────────────────────────────── */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.summaryTop}>
          <Text style={[styles.summaryTitle, { color: colors.mutedForeground }]}>
            Total Net Salary Received
          </Text>
          <Amount
            ghostable
            value={summary.totalNetReceived}
            currency="INR"
            style={[styles.totalNetValue, { color: colors.foreground }]}
          />
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              Regular Pay
            </Text>
            <Amount
              ghostable
              value={summary.totalRegularNet}
              currency="INR"
              style={[styles.metricValue, { color: colors.foreground }]}
            />
          </View>

          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              Variable / Bonus
            </Text>
            <Amount
              ghostable
              value={summary.totalVariableNet}
              currency="INR"
              style={[
                styles.metricValue,
                {
                  color:
                    summary.totalVariableNet > 0
                      ? colors.success
                      : colors.foreground,
                },
              ]}
            />
          </View>

          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
              Monthly Average
            </Text>
            <Amount
              ghostable
              value={summary.averageMonthlyNet}
              currency="INR"
              style={[styles.metricValue, { color: colors.foreground }]}
            />
          </View>
        </View>

        {summary.totalGrossReported !== null &&
        summary.totalGrossReported !== undefined ? (
          <View
            style={[
              styles.grossRow,
              { borderTopColor: surfaces.tile, borderTopWidth: 1 },
            ]}
          >
            <Text style={[styles.grossLabel, { color: colors.mutedForeground }]}>
              Total Reported Gross:
            </Text>
            <Amount
              ghostable
              value={summary.totalGrossReported}
              currency="INR"
              style={[styles.grossValue, { color: colors.foreground }]}
            />
          </View>
        ) : null}

        {summary.missingCount > 0 ? (
          <View
            style={[
              styles.missingAlert,
              { backgroundColor: colors.destructive + "15" },
            ]}
          >
            <AlertTriangle size={16} color={colors.destructive} />
            <Text
              style={[styles.missingAlertText, { color: colors.destructive }]}
            >
              {summary.missingCount} missing paycheck
              {summary.missingCount > 1 ? "s" : ""} detected in employment history
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {/* Year Filter */}
          <Chip
            label="All Years"
            selected={selectedYear === "ALL"}
            onPress={() => setSelectedYear("ALL")}
            size="sm"
          />
          {availableYears.map((yr) => (
            <Chip
              key={yr}
              label={yr}
              selected={selectedYear === yr}
              onPress={() => setSelectedYear(yr)}
              size="sm"
            />
          ))}

          {/* Classification Filter */}
          <View style={styles.divider} />
          <Chip
            label="All Types"
            selected={selectedClassification === "ALL"}
            onPress={() => setSelectedClassification("ALL")}
            size="sm"
          />
          <Chip
            label="Regular"
            selected={selectedClassification === "regular"}
            onPress={() => setSelectedClassification("regular")}
            size="sm"
          />
          <Chip
            label="Bonus / Variable"
            selected={selectedClassification === "bonus"}
            onPress={() => setSelectedClassification("bonus")}
            size="sm"
          />
        </ScrollView>
      </View>

      {/* ── Timeline Groups List ─────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Calendar size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No salary records found
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Confirmed and detected salary paychecks will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.groupsList}>
          {groups.map((group) => (
            <View key={group.month} style={styles.groupContainer}>
              {/* Group Month Header */}
              <View style={styles.groupHeader}>
                <Text
                  style={[styles.groupMonthTitle, { color: colors.foreground }]}
                >
                  {formatMonthName(group.month)}
                </Text>
                <Amount
                  ghostable
                  value={group.totalNet}
                  currency="INR"
                  style={[styles.groupTotalNet, { color: colors.foreground }]}
                />
              </View>

              {/* Items in Month */}
              <View style={styles.itemsColumn}>
                {group.items.map((item) => (
                  <TimelineItemCard
                    key={item.id}
                    item={item}
                    dateFormat={settings?.dateFormat}
                    onPress={() => {
                      if (item.type === "paycheck" && item.record) {
                        onSelectRecord?.(item.record);
                      } else if (item.type === "missing_paycheck") {
                        onSelectMissingPaycheck?.(
                          item.payPeriodMonth,
                          item.employer.name
                        );
                      }
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function TimelineItemCard({
  item,
  dateFormat,
  onPress,
}: {
  item: SalaryPaycheckTimelineItem;
  dateFormat?: Parameters<typeof formatDisplayDate>[1];
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();

  if (item.type === "missing_paycheck") {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.missingCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.destructive + "40",
          },
        ]}
      >
        <View style={styles.missingLeft}>
          <AlertTriangle size={18} color={colors.destructive} />
          <View style={styles.missingInfo}>
            <Text
              style={[styles.missingCardTitle, { color: colors.destructive }]}
            >
              Missing Paycheck ({item.employer.name})
            </Text>
            <Text
              style={[
                styles.missingCardSubtitle,
                { color: colors.mutedForeground },
              ]}
            >
              No credit recorded for {formatMonthName(item.payPeriodMonth)}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.itemCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.itemHeader}>
        <View style={styles.employerInfo}>
          <Building size={16} color={colors.primary} />
          <Text style={[styles.employerName, { color: colors.foreground }]}>
            {item.employer.name}
          </Text>
        </View>

        {item.isVariablePay ? (
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: colors.success + "20" },
            ]}
          >
            <Text
              style={[styles.typeBadgeText, { color: colors.success }]}
            >
              {item.classification.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.itemBody}>
        <View style={styles.itemAmounts}>
          <Text style={[styles.amountLabel, { color: colors.mutedForeground }]}>
            Net Pay
          </Text>
          <Amount
            ghostable
            value={item.netAmount ?? 0}
            currency="INR"
            style={[styles.netAmountText, { color: colors.foreground }]}
          />
        </View>

        <View style={styles.itemDates}>
          {item.payDate ? (
            <View style={styles.dateRow}>
              <Calendar size={12} color={colors.mutedForeground} />
              <Text
                style={[styles.dateText, { color: colors.mutedForeground }]}
              >
                {formatDisplayDate(item.payDate, dateFormat)}
              </Text>
            </View>
          ) : null}
          <View style={styles.dateRow}>
            <FileText size={12} color={colors.mutedForeground} />
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              Wage: {item.payPeriodMonth}
            </Text>
          </View>
        </View>
      </View>

      {/* Gross Pay Footer */}
      <View
        style={[
          styles.itemFooter,
          { borderTopColor: surfaces.tile, borderTopWidth: 1 },
        ]}
      >
        <Text style={[styles.grossFooterText, { color: colors.mutedForeground }]}>
          Gross Pay:{" "}
          {item.isGrossKnown && item.grossAmount != null ? (
            <Amount
              ghostable
              value={item.grossAmount}
              currency="INR"
              style={[styles.grossFooterText, { color: colors.mutedForeground }]}
            />
          ) : (
            "Not specified"
          )}
        </Text>
        {item.hasBreakdown ? (
          <Text style={[styles.breakdownLink, { color: colors.primary }]}>
            Breakdown Available ›
          </Text>
        ) : (
          <ChevronRight size={14} color={colors.mutedForeground} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  summaryCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  summaryTop: {
    gap: 4,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  totalNetValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metricItem: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  grossRow: {
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grossLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  grossValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  missingAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  missingAlertText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterSection: {
    marginBottom: 4,
  },
  filterScroll: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(150,150,150,0.3)",
    marginHorizontal: 4,
  },
  groupsList: {
    gap: 20,
  },
  groupContainer: {
    gap: 10,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  groupMonthTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  groupTotalNet: {
    fontSize: 16,
    fontWeight: "700",
  },
  itemsColumn: {
    gap: 10,
  },
  itemCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  employerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  employerName: {
    fontSize: 14,
    fontWeight: "600",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  itemBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  itemAmounts: {
    gap: 2,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  netAmountText: {
    fontSize: 20,
    fontWeight: "800",
  },
  itemDates: {
    alignItems: "flex-end",
    gap: 4,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
  },
  itemFooter: {
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grossFooterText: {
    fontSize: 11,
  },
  breakdownLink: {
    fontSize: 11,
    fontWeight: "600",
  },
  missingCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  missingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  missingInfo: {
    gap: 2,
    flex: 1,
  },
  missingCardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  missingCardSubtitle: {
    fontSize: 12,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
});
