import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Lightbulb } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Section } from "@/components/dashboard/primitives";
import { FeeRecordRow } from "@/components/fees/FeeRecordRow";
import type { FeeRecord } from "@/shared/types/fee";
import type { FeeDashboardFilters } from "@/shared/utils/feeDashboard";
import { buildFeeInsights } from "@/shared/utils/feeInsights";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Fee insights (SPENDLY-322). Each row opens how it was worked out and the
 * transactions behind it. Informational — compares only with the user's own
 * history and recommends nothing.
 */
export function FeeInsightsSection({
  records,
  filters,
  today,
  currency,
  accountNames,
  onOpenRecord,
}: {
  records: readonly FeeRecord[];
  filters: FeeDashboardFilters;
  today: string;
  currency: string;
  accountNames: Map<string, string>;
  onOpenRecord: (record: FeeRecord) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const [openId, setOpenId] = useState<string | null>(null);
  const insights = useMemo(
    () => buildFeeInsights(records, today, { accountIds: filters.accountIds, feeTypes: filters.feeTypes, providers: filters.providers }),
    [records, today, filters.accountIds, filters.feeTypes, filters.providers]
  );
  const byKey = useMemo(() => new Map(records.map((r) => [r.key, r] as const)), [records]);
  const open = openId ? insights.find((i) => i.id === openId) : undefined;

  if (insights.length === 0) return null;

  return (
    <>
      <Section title="Insights" subtitle="From your own fee history">
        <View style={{ gap: theme.space.xs }}>
          {insights.slice(0, 6).map((insight) => (
            <Pressable
              key={insight.id}
              onPress={() => setOpenId(insight.id)}
              accessibilityRole="button"
              accessibilityLabel={`${insight.title}. ${insight.body}`}
              accessibilityHint="Shows how this was worked out and the transactions behind it"
              style={({ pressed }) => [styles.row, { gap: theme.space.md, backgroundColor: pressed ? surfaces.tile : "transparent", borderRadius: theme.radius.md }]}
            >
              <Lightbulb size={18} color={theme.colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{insight.title}</Text>
                <Text numberOfLines={3} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                  {insight.body}
                </Text>
              </View>
              <ChevronRight size={16} color={theme.colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      </Section>

      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open?.title} density="compact">
        {open ? (
          <View style={{ gap: theme.space.lg }}>
            <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>{open.body}</Text>
            <View style={[styles.basis, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md }]}>
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.xs }}>How this was worked out</Text>
              <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{open.basis}</Text>
            </View>
            <View style={{ gap: theme.space.xs }}>
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Transactions behind this ({open.recordKeys.length})
              </Text>
              <View style={{ marginHorizontal: -theme.space.lg }}>
                {open.recordKeys.slice(0, 30).map((key) => {
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
              {open.recordKeys.length > 30 ? (
                <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                  Showing the 30 most recent. All of them are in Fees → All fees.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingVertical: 6, paddingHorizontal: 4 },
  basis: { gap: 4 },
});
