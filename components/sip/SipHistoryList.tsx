import React, { memo, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SipTransaction } from "@/shared/features/sip/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Amount } from "@/components/common/Amount";
import { Pill, type Tone } from "@/components/dashboard/primitives";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { sampleScrollFps } from "@/lib/perf";

export type SipHistoryListProps = {
  transactions: SipTransaction[];
  currency?: string;
};

const SipHistoryRow = memo(function SipHistoryRow({
  item,
  currency,
}: {
  item: SipTransaction;
  currency: string;
}) {
  const { theme } = useTheme();

  const { settings } = useSettings();
  const statusTone: Tone =
    item.status === "executed"
      ? "positive"
      : item.status === "skipped"
        ? "warning"
        : item.status === "failed"
          ? "negative"
          : "muted";

  return (
    <View
      style={[
        styles.itemContainer,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.assetName, { color: theme.colors.cardForeground }]}>
          {item.assetName} ({item.symbol})
        </Text>
        <Pill label={item.status.toUpperCase()} tone={statusTone} />
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Date
          </Text>
          <Text style={[styles.value, { color: theme.colors.foreground }]}>
            {formatDisplayDate(item.date, settings?.dateFormat)}
          </Text>
        </View>
        <View style={styles.detailCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Amount
          </Text>
          <Amount
            ghostable
            value={item.investmentAmount}
            currency={currency}
            style={styles.value}
          />
        </View>
        <View style={styles.detailCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Units
          </Text>
          <Text style={[styles.value, { color: theme.colors.foreground }]}>
            {item.unitsPurchased.toFixed(4)}
          </Text>
        </View>
        <View style={styles.detailCol}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Price
          </Text>
          <Amount
            ghostable
            value={item.marketPrice}
            currency={currency}
            style={styles.value}
          />
        </View>
      </View>
    </View>
  );
});

export function SipHistoryList({
  transactions,
  currency = "INR",
}: SipHistoryListProps) {
  const { theme } = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: SipTransaction }) => (
      <SipHistoryRow item={item} currency={currency} />
    ),
    [currency]
  );

  if (transactions.length === 0) {
    return (
      <Text
        style={{
          color: theme.colors.mutedForeground,
          textAlign: "center",
          marginTop: 24,
        }}
      >
        No SIP history found.
      </Text>
    );
  }

  return (
    <View style={styles.listWrap}>
      <FlashList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScrollBeginDrag={() => sampleScrollFps("sip_history")}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: {
    minHeight: 200,
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  itemContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  assetName: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  detailCol: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
  },
});
