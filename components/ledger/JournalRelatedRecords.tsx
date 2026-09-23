/**
 * SPENDLY-110 — the records connected to one journal transaction.
 *
 * Read-only by design. A credit-card purchase is already an `Expense` in the
 * Journal, so the payment that settled its statement is the *same rupees* seen
 * from the other side. Showing it is useful context; adding it to anything
 * would double-count. Rows carrying `isSameMoney` say so explicitly rather
 * than leaving the reader to assume the figures sum.
 *
 * The resolution logic is in `shared/utils/journalRelatedRecords.ts` so it is
 * testable; this file only lays it out.
 */

import { StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { JournalRelatedRecord } from "@/shared/utils/journalRelatedRecords";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function JournalRelatedRecords({
  records,
}: {
  records: JournalRelatedRecord[];
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const currency = useDisplayCurrency();

  // The common case is a plain row with nothing attached — render nothing
  // rather than an empty section.
  if (records.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.colors.mutedForeground }]}>
        RELATED
      </Text>

      {records.map((record, index) => (
        <View
          key={`${record.kind}-${record.recordId ?? index}`}
          style={[
            styles.row,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.02)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.rowLeft}>
            <Text
              style={[styles.label, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {record.label}
            </Text>
            {record.detail ? (
              <Text
                style={[styles.detail, { color: theme.colors.mutedForeground }]}
              >
                {record.detail}
              </Text>
            ) : null}
          </View>

          {record.amount !== undefined ? (
            <View style={styles.rowRight}>
              <Amount
                value={record.amount}
                currency={currency}
                ghostable
                style={[styles.amount, { color: theme.colors.foreground }]}
              />
              {record.isSameMoney ? (
                <Text
                  style={[
                    styles.sameMoney,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  same money
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}

      <Text style={[styles.footnote, { color: theme.colors.mutedForeground }]}>
        Shown for context. Amounts marked &quot;same money&quot; are this
        transaction seen from another side, so they are not additional spending.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    marginTop: 4,
  },
  heading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  detail: {
    fontSize: 11,
    lineHeight: 16,
  },
  amount: {
    fontSize: 13,
    fontWeight: "700",
  },
  sameMoney: {
    fontSize: 9,
    fontWeight: "600",
  },
  footnote: {
    fontSize: 10,
    lineHeight: 15,
  },
});
