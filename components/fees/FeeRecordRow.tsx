import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { feeRecordIcon } from "@/components/fees/feeIcons";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import type { FeeRecord } from "@/shared/types/fee";
import { feeRecordTitle } from "@/shared/utils/feeReviewForm";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface FeeRecordRowProps {
  record: FeeRecord;
  currency: string;
  accountName?: string;
  /** Bulk mode: rows toggle selection instead of opening. */
  selecting: boolean;
  selected: boolean;
  onPress: (record: FeeRecord) => void;
  onLongPress: (record: FeeRecord) => void;
}

/**
 * One fee record (SPENDLY-315). A list row, not a card: icon, what it is,
 * where it came from, the amount and its status.
 */
export const FeeRecordRow = memo(function FeeRecordRow({
  record,
  currency,
  accountName,
  selecting,
  selected,
  onPress,
  onLongPress,
}: FeeRecordRowProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const Icon = feeRecordIcon(record);
  const title = feeRecordTitle(record);
  const credit = record.source.direction === "credit";
  const context = [record.source.date, accountName].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={() => onPress(record)}
      onLongPress={() => onLongPress(record)}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${title}, ${record.source.merchant ?? ""}, ${context}`}
      accessibilityHint={selecting ? "Selects this for bulk review" : "Opens review and correction"}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.space.lg,
          paddingVertical: theme.space.md,
          gap: theme.space.md,
          borderBottomColor: surfaces.divider,
          backgroundColor: selected ? withAlpha(theme.colors.primary, 0.08) : pressed ? surfaces.tile : "transparent",
        },
      ]}
    >
      {selecting ? (
        <View
          style={[
            styles.check,
            {
              borderColor: selected ? theme.colors.primary : theme.colors.outline,
              backgroundColor: selected ? theme.colors.primary : "transparent",
            },
          ]}
        >
          {selected ? <Check size={14} color={theme.colors.primaryForeground} strokeWidth={3} /> : null}
        </View>
      ) : (
        <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
          <Icon size={18} color={theme.colors.primary} />
        </View>
      )}

      <View style={styles.body}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {title}
        </Text>
        {record.source.merchant ? (
          <Text numberOfLines={1} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
            {record.source.merchant}
          </Text>
        ) : null}
        <View style={[styles.meta, { gap: theme.space.sm }]}>
          <FeeStatusBadge status={record.status} />
          <Text numberOfLines={1} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs, flexShrink: 1 }}>
            {context}
          </Text>
        </View>
      </View>

      <View style={styles.trailing}>
        <Amount
          value={credit ? record.source.amount : -record.source.amount}
          currency={currency}
          style={{
            color: credit ? theme.colors.success : theme.colors.foreground,
            fontFamily: theme.fontFamily.semibold,
            fontSize: theme.typography.sm,
          }}
        />
        {!selecting ? <ChevronRight size={16} color={theme.colors.mutedForeground} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
