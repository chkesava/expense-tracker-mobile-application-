import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Repeat, TrendingDown, TrendingUp } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { Section } from "@/components/dashboard/primitives";
import { FeeRecordRow } from "@/components/fees/FeeRecordRow";
import { feeTypeIcon } from "@/components/fees/feeIcons";
import { feeTypeLabel } from "@/shared/data/feeTaxonomy";
import type { FeeRecord } from "@/shared/types/fee";
import type { FeeDashboardFilters } from "@/shared/utils/feeDashboard";
import { detectFeePatterns, feePatternLabel, type FeePattern } from "@/shared/utils/feePatterns";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface FeePatternsSectionProps {
  records: readonly FeeRecord[];
  filters: FeeDashboardFilters;
  today: string;
  currency: string;
  accountNames: Map<string, string>;
  onOpenRecord: (record: FeeRecord) => void;
}

/**
 * Repeating fees (SPENDLY-318). Informational: what the history shows and a
 * clearly labelled estimate — never a provider comparison or product advice.
 * Uses the whole history (patterns need it) with the account / type / provider
 * filters applied; the period filter does not narrow it.
 */
export function FeePatternsSection({ records, filters, today, currency, accountNames, onOpenRecord }: FeePatternsSectionProps) {
  const { theme } = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);

  const patterns = useMemo(() => {
    return detectFeePatterns(records, today).filter(
      (p) =>
        (filters.accountIds.length === 0 || (p.accountId && filters.accountIds.includes(p.accountId))) &&
        (filters.feeTypes.length === 0 || filters.feeTypes.includes(p.feeType)) &&
        (filters.providers.length === 0 || filters.providers.includes(p.provider))
    );
  }, [records, today, filters.accountIds, filters.feeTypes, filters.providers]);

  const byKey = useMemo(() => new Map(records.map((r) => [r.key, r] as const)), [records]);
  const open = openId ? patterns.find((p) => p.id === openId) : undefined;
  const where = (p: FeePattern) => (p.accountId ? accountNames.get(p.accountId) ?? "Unknown account" : p.provider);

  if (patterns.length === 0) {
    return (
      <Section title="Repeating fees" subtitle="Fees that keep coming back">
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Nothing repeats often enough yet. A pattern needs at least 3 charges across 2 months, or an annual fee seen twice.
        </Text>
      </Section>
    );
  }

  return (
    <>
      <Section title="Repeating fees" subtitle="From your own history — yearly figures are estimates">
        <View style={{ gap: theme.space.xs }}>
          {patterns.slice(0, 5).map((p) => (
            <PatternRow key={p.id} pattern={p} where={where(p)} currency={currency} onPress={() => setOpenId(p.id)} />
          ))}
        </View>
      </Section>

      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open ? feeTypeLabel(open.feeType) : undefined} density="compact">
        {open ? (
          <View style={{ gap: theme.space.lg }}>
            <View style={{ gap: theme.space.xs }}>
              <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
                {feePatternLabel(open)} · {where(open)}
              </Text>
              {open.signals.map((s) => (
                <Text key={s} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>
                  • {s}
                </Text>
              ))}
            </View>

            <View style={{ gap: 2 }}>
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                Estimated per year
              </Text>
              <Amount value={open.estimatedYearly} currency={currency} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: 24 }} />
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                {open.estimateBasis} Total so far: {formatAmount(open.totalCost, currency)}.
              </Text>
            </View>

            <View style={{ gap: theme.space.xs }}>
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Transactions behind this ({open.recordKeys.length})
              </Text>
              <View style={{ marginHorizontal: -theme.space.lg }}>
                {[...open.recordKeys].reverse().map((key) => {
                  const record = byKey.get(key);
                  if (!record) return null;
                  return (
                    <FeeRecordRow
                      key={key}
                      record={record}
                      currency={currency}
                      accountName={record.source.accountId ? accountNames.get(record.source.accountId) : undefined}
                      selecting={false}
                      selected={false}
                      onPress={(r) => {
                        setOpenId(null);
                        onOpenRecord(r);
                      }}
                      onLongPress={() => undefined}
                    />
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function PatternRow({ pattern, where, currency, onPress }: { pattern: FeePattern; where: string; currency: string; onPress: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const Icon = feeTypeIcon(pattern.feeType);
  const TrendIcon = pattern.trend === "rising" ? TrendingUp : pattern.trend === "falling" ? TrendingDown : Repeat;
  const sub = `${feePatternLabel(pattern)} · ${pattern.occurrences}× since ${pattern.firstSeen.slice(0, 7)}${pattern.mayHaveStopped ? " · may have stopped" : ""}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${feeTypeLabel(pattern.feeType)} at ${where}. ${sub}. Estimated ${formatAmount(pattern.estimatedYearly, currency)} a year.`}
      style={({ pressed }) => [styles.row, { gap: theme.space.md, backgroundColor: pressed ? surfaces.tile : "transparent", borderRadius: theme.radius.md }]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.sm }]}>
        <Icon size={16} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>
          {feeTypeLabel(pattern.feeType)} · {where}
        </Text>
        <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {sub}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          ~{formatAmount(pattern.estimatedYearly, currency)}/yr
        </Text>
        <TrendIcon size={14} color={pattern.trend === "rising" ? theme.colors.warning : theme.colors.mutedForeground} />
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingVertical: 6, paddingHorizontal: 4 },
  icon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
