import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AlertCircle, ChevronRight, SlidersHorizontal } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Modal } from "@/components/common/Modal";
import { ProgressTrack, Section } from "@/components/dashboard/primitives";
import { FeePatternsSection } from "@/components/fees/FeePatternsSection";
import { FeeSignalsSection } from "@/components/fees/FeeSignals";
import { useFeeSignals } from "@/hooks/useFeeSignals";
import { FeeRecordRow } from "@/components/fees/FeeRecordRow";
import { feeTypeIcon } from "@/components/fees/feeIcons";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { feeTypeLabel, isFeeTypeId } from "@/shared/data/feeTaxonomy";
import type { FeeRecord, FeeTypeId } from "@/shared/types/fee";
import { todayDateKey } from "@/shared/utils/dates";
import {
  EMPTY_FEE_DASHBOARD_FILTERS,
  FEE_PERIODS,
  buildFeeDashboard,
  countActiveFeeFilters,
  type FeeBreakdownRow,
  type FeeDashboardFilters,
} from "@/shared/utils/feeDashboard";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { monthLabel } from "@/shared/utils/monthLabel";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface FeeOverviewProps {
  records: readonly FeeRecord[];
  currency: string;
  accountNames: Map<string, string>;
  onOpenReview: () => void;
  onOpenRecord: (record: FeeRecord) => void;
}

/**
 * Fee & Charges cost overview (SPENDLY-316). Every number comes from
 * `buildFeeDashboard`, which sums the canonical fee records — the hero, trend
 * and breakdowns reconcile by construction.
 */
export function FeeOverview({ records, currency, accountNames, onOpenReview, onOpenRecord }: FeeOverviewProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const bottomPadding = usePageListBottomPadding();
  const [filters, setFilters] = useState<FeeDashboardFilters>(EMPTY_FEE_DASHBOARD_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = todayDateKey();

  const dash = useMemo(() => buildFeeDashboard(records, filters, today), [records, filters, today]);
  const signals = useFeeSignals(records);
  const activeFilters = countActiveFeeFilters(filters);
  const hasAnyFee = dash.options.feeTypes.length > 0 || dash.totals.count > 0 || dash.options.accountIds.length > 0;
  const periodLabel = FEE_PERIODS.find((p) => p.id === filters.period)?.label ?? "";

  const money = (value: number) => formatAmount(value, currency);
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  if (!hasAnyFee) {
    return (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding }}>
        {dash.unreviewedCount > 0 ? <ReviewBanner count={dash.unreviewedCount} onPress={onOpenReview} /> : null}
        <EmptyState
          illustration="expenses"
          title="No fees counted yet"
          description="When Spendly finds bank charges, card fees or GST on fees in your transactions — or you confirm one — your totals appear here."
          primaryAction={dash.unreviewedCount > 0 ? { label: "Review detected fees", onPress: onOpenReview } : undefined}
        />
      </ScrollView>
    );
  }

  const change = dash.monthChange;
  const changeText =
    change.delta === 0
      ? "Same as last month"
      : `${money(Math.abs(change.delta))} ${change.delta > 0 ? "more" : "less"} than last month${change.pct !== null ? ` (${change.delta > 0 ? "+" : "−"}${Math.abs(Math.round(change.pct))}%)` : ""}`;

  const accountLabel = (id: string) => (id ? accountNames.get(id) ?? "Unknown account" : "No account");
  const typeLabel = (key: string) => (isFeeTypeId(key) ? feeTypeLabel(key) : key);

  const renderRows = (rows: FeeBreakdownRow[], label: (key: string) => string, icon?: (key: string) => React.ReactNode) =>
    rows.slice(0, 6).map((row) => (
      <View key={row.key || "none"} style={[styles.breakdownRow, { gap: theme.space.md }]} accessible accessibilityLabel={`${label(row.key)}: ${money(row.cost)}, ${Math.round(row.share * 100)} percent`}>
        {icon ? <View style={[styles.rowIcon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.sm }]}>{icon(row.key)}</View> : null}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.between}>
            <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
              {label(row.key)}
            </Text>
            <Amount value={row.cost} currency={currency} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }} />
          </View>
          <ProgressTrack pct={row.share * 100} color={theme.colors.primary} />
          {row.totals.netTax !== 0 || row.totals.reversedFee !== 0 ? (
            <Text style={muted}>
              {[
                `Fee ${money(row.totals.netFee)}`,
                row.totals.netTax !== 0 ? `GST ${money(row.totals.netTax)}` : null,
                row.totals.reversedFee !== 0 ? `${money(row.totals.reversedFee)} reversed` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>
    ));

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }} showsVerticalScrollIndicator={false}>
        {/* Filters: one row above everything they affect */}
        <View style={[styles.between, { gap: theme.space.sm }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} style={{ flex: 1 }}>
            {FEE_PERIODS.map((p) => (
              <Chip key={p.id} label={p.label} size="sm" selected={filters.period === p.id} onPress={() => setFilters({ ...filters, period: p.id })} accessibilityRole="radio" />
            ))}
          </ScrollView>
          <Chip
            label={activeFilters > 0 ? `Filters · ${activeFilters}` : "Filters"}
            size="sm"
            appearance="outline"
            selected={activeFilters > 0}
            icon={(color) => <SlidersHorizontal size={14} color={color} />}
            onPress={() => setFiltersOpen(true)}
            accessibilityLabel={`Filters${activeFilters ? `, ${activeFilters} active` : ""}`}
          />
        </View>

        {dash.unreviewedCount > 0 ? <ReviewBanner count={dash.unreviewedCount} onPress={onOpenReview} /> : null}

        {/* Hero */}
        <Section title={`Fees paid · ${periodLabel}`} subtitle="Fees and GST on fees, after reversals">
          <View style={{ gap: theme.space.sm }}>
            <Amount value={dash.cost} currency={currency} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: 30 }} />
            <View style={[styles.wrap, { gap: theme.space.lg }]}>
              <Stat label="Fees" value={money(dash.totals.netFee)} />
              <Stat label="GST on fees" value={money(dash.totals.netTax)} />
              <Stat label="Reversed" value={money(dash.totals.reversedFee + dash.totals.reversedTax)} />
            </View>
            {dash.totals.netInterest !== 0 ? (
              <Text style={muted}>
                Interest {money(dash.totals.netInterest)} is tracked separately and not included above.
              </Text>
            ) : null}
            <Text style={[muted, { color: change.delta > 0 ? theme.colors.warning : theme.colors.mutedForeground }]}>
              This month: {changeText}
            </Text>
          </View>
        </Section>

        <FeeSignalsSection
          active={signals.active}
          dismissed={signals.dismissed}
          records={records}
          currency={currency}
          accountNames={accountNames}
          actions={signals}
          restore={signals.restore}
          onOpenRecord={onOpenRecord}
        />

        {/* Trend */}
        <Section title="Last 12 months" subtitle="Fees + GST per month. Tap a bar for the amount.">
          <BarChart
            data={dash.trend.map((p) => ({ label: monthLabel(p.month).slice(0, 3), value: Math.max(0, p.cost) }))}
            height={160}
            currency={currency}
            primaryLabel="Fees"
            primaryColor={theme.colors.primary}
            showLegend={false}
            showYAxis
          />
        </Section>

        {dash.totals.count > 0 ? (
          <>
            <Section title="By fee type">{renderRows(dash.byType, typeLabel, (key) => {
              const Icon = feeTypeIcon(isFeeTypeId(key) ? key : "other");
              return <Icon size={16} color={theme.colors.primary} />;
            })}</Section>
            <Section title="By account or card">{renderRows(dash.byAccount, accountLabel)}</Section>
            <Section title="Top fee sources" subtitle="Banks and providers that charged you">{renderRows(dash.byProvider, (k) => k)}</Section>

            <FeePatternsSection
              records={records}
              filters={filters}
              today={today}
              currency={currency}
              accountNames={accountNames}
              onOpenRecord={onOpenRecord}
            />

            <Section title="Recent fees" plain>
              <View style={{ marginHorizontal: -theme.space.lg }}>
                {dash.recent.map((record) => (
                  <FeeRecordRow
                    key={record.key}
                    record={record}
                    currency={currency}
                    accountName={record.source.accountId ? accountNames.get(record.source.accountId) : undefined}
                    selecting={false}
                    selected={false}
                    onPress={onOpenRecord}
                    onLongPress={onOpenRecord}
                  />
                ))}
              </View>
            </Section>
          </>
        ) : (
          <Text style={[muted, { textAlign: "center" }]}>No fees in this period{activeFilters ? " with these filters" : ""}.</Text>
        )}

        <Text style={[muted, { textAlign: "center" }]}>
          Only fees Spendly is confident about, or that you confirmed, are counted. Your expense totals elsewhere are unchanged.
        </Text>
      </ScrollView>

      <Modal isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter fees" density="compact">
        <View style={{ gap: theme.space.lg }}>
          <FilterGroup
            title="Account or card"
            options={dash.options.accountIds.map((id) => ({ id, label: accountLabel(id) }))}
            selected={filters.accountIds}
            onChange={(accountIds) => setFilters({ ...filters, accountIds })}
          />
          <FilterGroup
            title="Fee type"
            options={dash.options.feeTypes.map((id) => ({ id, label: feeTypeLabel(id) }))}
            selected={filters.feeTypes}
            onChange={(feeTypes) => setFilters({ ...filters, feeTypes: feeTypes as FeeTypeId[] })}
          />
          <FilterGroup
            title="Bank or provider"
            options={dash.options.providers.map((id) => ({ id, label: id }))}
            selected={filters.providers}
            onChange={(providers) => setFilters({ ...filters, providers })}
          />
          <View style={{ gap: theme.space.sm }}>
            <Button variant="primary" onPress={() => setFiltersOpen(false)}>Show results</Button>
            <Button variant="ghost" disabled={activeFilters === 0} onPress={() => setFilters({ ...EMPTY_FEE_DASHBOARD_FILTERS, period: filters.period })}>
              Clear filters
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{label}</Text>
      <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{value}</Text>
    </View>
  );
}

function ReviewBanner({ count, onPress }: { count: number; onPress: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} possible fees need your review`}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: pressed ? surfaces.control : surfaces.tile, borderRadius: theme.radius.md, gap: theme.space.sm, padding: theme.space.md },
      ]}
    >
      <AlertCircle size={18} color={theme.colors.warning} />
      <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
        {count} possible {count === 1 ? "fee needs" : "fees need"} your review
      </Text>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { theme } = useTheme();
  if (options.length === 0) return null;
  return (
    <View style={{ gap: theme.space.sm }}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {title}
      </Text>
      <View style={[styles.wrap, { gap: theme.space.sm }]}>
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <Chip
              key={o.id}
              label={o.label}
              size="sm"
              selected={on}
              onPress={() => onChange(on ? selected.filter((s) => s !== o.id) : [...selected, o.id])}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  breakdownRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, minHeight: 48 },
  rowIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", alignItems: "center", minHeight: 48 },
});
