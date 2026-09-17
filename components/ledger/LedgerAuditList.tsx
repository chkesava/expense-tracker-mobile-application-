import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/Skeleton";
import { useLedgerEvents } from "@/hooks/useLedgerEvents";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { LedgerEvent } from "@/shared/types/ledgerEvent";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

function eventClock(createdAt: unknown): string {
  if (!createdAt) return "";
  if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    "toDate" in createdAt &&
    typeof (createdAt as { toDate?: unknown }).toDate === "function"
  ) {
    return (createdAt as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (createdAt instanceof Date) return createdAt.toLocaleString();
  if (typeof createdAt === "number") return new Date(createdAt).toLocaleString();
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleString();
  }
  return "";
}

function eventTitle(event: LedgerEvent): string {
  return (
    event.before.category ||
    event.before.source ||
    event.after?.category ||
    event.after?.source ||
    "Transaction"
  );
}

export function LedgerAuditList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();
  const { events, loading, error, retry } = useLedgerEvents();

  const renderItem = useCallback(
    ({ item }: { item: LedgerEvent }) => {
      const isDelete = item.action === "delete";
      const title = eventTitle(item);
      const when = eventClock(item.createdAt);
      const kindLabel = item.kind === "income" ? "Income" : "Expense";
      const actionLabel = isDelete ? "Deleted" : "Edited";
      const chipColor = isDelete ? "#EF4444" : theme.colors.primary;

      return (
        <View
          style={[
            styles.row,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.rowTop}>
            <View
              style={[
                styles.chip,
                { backgroundColor: `${chipColor}22` },
              ]}
            >
              <Text style={[styles.chipText, { color: chipColor }]}>
                {actionLabel}
              </Text>
            </View>
            <Text
              style={[styles.kind, { color: theme.colors.mutedForeground }]}
            >
              {kindLabel}
            </Text>
          </View>
          <Text
            style={[styles.title, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {isDelete ? (
            <Amount
              value={item.before.amount}
              currency={displayCurrency}
              ghostable
              style={[styles.amount, { color: theme.colors.mutedForeground }]}
            />
          ) : (
            <View style={styles.amountRow}>
              <Amount
                value={item.before.amount}
                currency={displayCurrency}
                ghostable
                style={[styles.amount, { color: theme.colors.mutedForeground }]}
              />
              <Text style={{ color: theme.colors.mutedForeground }}>→</Text>
              <Amount
                value={item.after?.amount ?? 0}
                currency={displayCurrency}
                ghostable
                style={[styles.amount, { color: theme.colors.foreground }]}
              />
            </View>
          )}
          {when ? (
            <Text style={[styles.when, { color: theme.colors.mutedForeground }]}>
              {when}
            </Text>
          ) : null}
        </View>
      );
    },
    [displayCurrency, theme]
  );

  if (error) {
    return (
      <ErrorState
        title="Couldn't load the audit trail"
        description={error.message}
        onRetry={retry}
      />
    );
  }

  if (loading && events.length === 0) {
    return (
      <View style={{ gap: 8, marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={72} borderRadius={theme.radius.lg} />
        ))}
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        illustration="search"
        title="No edits or deletions yet"
        description="Changes to journal expenses and income will show up here with the previous and new values."
        tip="Soft-deleted rows stay on file. They leave History and balances, but this trail keeps the record."
      />
    );
  }

  return (
    <FlashList
      style={styles.list}
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      extraData={isDark}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  row: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    gap: 6,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  kind: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
  },
  when: {
    fontSize: 11,
  },
});
