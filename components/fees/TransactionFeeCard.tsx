import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight } from "lucide-react-native";

import { feeRecordIcon } from "@/components/fees/feeIcons";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { useFeeIntelligence } from "@/hooks/useFeeIntelligence";
import { feeDetailHref, feeRecordForTransaction } from "@/shared/utils/feeDetail";
import { feeRecordTitle } from "@/shared/utils/feeReviewForm";
import type { TransactionRef } from "@/shared/utils/transactionRef";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * On a transaction's detail screen: the fee Spendly sees in it, linking to the
 * fee detail (SPENDLY-317 — "from fee to source transaction and back").
 * Renders nothing when the transaction has no fee record or data is loading.
 */
export function TransactionFeeCard({ transactionRef }: { transactionRef: TransactionRef }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { result } = useFeeIntelligence();
  const record = result ? feeRecordForTransaction(result.records, transactionRef) : undefined;
  if (!record) return null;
  const Icon = feeRecordIcon(record);

  return (
    <Pressable
      onPress={() => router.push(feeDetailHref(record.key) as Href)}
      accessibilityRole="button"
      accessibilityLabel={`Fee: ${feeRecordTitle(record)}. Opens fee details`}
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
        <Icon size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          Fees & charges
        </Text>
        <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }}>
          {feeRecordTitle(record)}
        </Text>
        <FeeStatusBadge status={record.status} />
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
