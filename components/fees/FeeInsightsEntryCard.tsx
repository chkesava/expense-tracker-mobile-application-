import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, ReceiptText } from "lucide-react-native";

import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFeeIntelligence } from "@/hooks/useFeeIntelligence";
import { todayDateKey } from "@/shared/utils/dates";
import { EMPTY_FEE_DASHBOARD_FILTERS, buildFeeDashboard } from "@/shared/utils/feeDashboard";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { feeCandidateQueue } from "@/shared/utils/feeDetection";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Entry point to Fees & charges from Insights (SPENDLY-315): this month's fee
 * cost from the same aggregate as the overview (SPENDLY-316) plus the review
 * count.
 */
export function FeeInsightsEntryCard() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { result, loading } = useFeeIntelligence();
  const currency = useDisplayCurrency();
  const summary = useMemo(() => {
    if (!result) return null;
    const dash = buildFeeDashboard(result.records, EMPTY_FEE_DASHBOARD_FILTERS, todayDateKey());
    return { cost: dash.cost, toReview: feeCandidateQueue(result.records).length };
  }, [result]);
  const toReview = summary?.toReview ?? 0;

  const subtitle = loading || !summary
    ? "Checking your transactions…"
    : [
        summary.cost !== 0 ? `${formatAmount(summary.cost, currency)} this month` : null,
        toReview > 0 ? `${toReview} to review` : null,
      ].filter(Boolean).join(" · ") || "Bank charges, card fees and GST on fees";

  return (
    <Pressable
      onPress={() => router.push("/fees" as never)}
      accessibilityRole="button"
      accessibilityLabel={`Fees and charges. ${subtitle}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: theme.colors.border,
          backgroundColor: pressed ? surfaces.tile : theme.colors.card,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
          gap: theme.space.md,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
        <ReceiptText size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.body}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>
          Fees & charges
        </Text>
        <Text style={{ color: toReview > 0 ? theme.colors.warning : theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64, marginBottom: 12 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
});
