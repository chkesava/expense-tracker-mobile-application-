import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/Skeleton";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useLedgerEvents } from "@/hooks/useLedgerEvents";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  restoreExpense,
  restoreIncome,
} from "@/services/ledger/mutateLedgerTransaction";
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
  const listBottomPadding = usePageListBottomPadding();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const restoringRef = useRef(new Set<string>());

  /**
   * A row is restorable when its newest event is the delete. A later edit or
   * restore means it is already back, so offering Restore would fail on
   * `assertRemovedAndRestorable` and read as a broken button.
   *
   * `events` arrives newest-first, so the first event seen for a docId is its
   * latest.
   */
  const latestActionByRow = useMemo(() => {
    const latest = new Map<string, LedgerEvent["action"]>();
    for (const event of events) {
      const key = `${event.kind}:${event.docId}`;
      if (!latest.has(key)) latest.set(key, event.action);
    }
    return latest;
  }, [events]);

  const handleRestore = useCallback(
    async (event: LedgerEvent) => {
      const uid = user?.uid;
      if (!uid) {
        toast.error("Not authenticated");
        return;
      }
      const key = `${event.kind}:${event.docId}`;
      if (restoringRef.current.has(key)) return;
      restoringRef.current.add(key);
      setRestoringId(key);

      try {
        const options = {
          lockPastMonths: settings.lockPastMonths,
          timezone: settings.timezone,
          reason: "Restored from the audit trail",
        };
        const { outcome } =
          event.kind === "expense"
            ? await restoreExpense(uid, event.docId, options)
            : await restoreIncome(uid, event.docId, options);
        void haptic.success();
        toast.success(
          writeSavedMessage(
            outcome,
            `${event.kind === "expense" ? "Expense" : "Income"} restored`
          )
        );
      } catch (err) {
        logError("ledgerAuditList.restore", err);
        toast.error(friendlyErrorMessage(err, "Failed to restore transaction"));
      } finally {
        restoringRef.current.delete(key);
        setRestoringId(null);
      }
    },
    [user?.uid, settings.lockPastMonths, settings.timezone]
  );

  const renderItem = useCallback(
    ({ item }: { item: LedgerEvent }) => {
      const isDelete = item.action === "delete";
      const isRestore = item.action === "restore";
      const title = eventTitle(item);
      const when = eventClock(item.createdAt);
      const kindLabel = item.kind === "income" ? "Income" : "Expense";
      // `action` is a stored string, so an unrecognised value from another
      // client falls through to "Edited" rather than vanishing from the trail.
      const actionLabel = isDelete
        ? "Deleted"
        : isRestore
          ? "Restored"
          : "Edited";
      const chipColor = isDelete
        ? "#EF4444"
        : isRestore
          ? theme.colors.success
          : theme.colors.primary;

      const rowKey = `${item.kind}:${item.docId}`;
      // Only the newest event for a row can be acted on, and only if it is the
      // delete — otherwise the row is already back in the ledger.
      const canRestore =
        isDelete && latestActionByRow.get(rowKey) === "delete";
      const isRestoring = restoringId === rowKey;

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
          {item.reason ? (
            <Text
              style={[styles.reason, { color: theme.colors.mutedForeground }]}
              numberOfLines={2}
            >
              {item.reason}
            </Text>
          ) : null}
          {when ? (
            <Text style={[styles.when, { color: theme.colors.mutedForeground }]}>
              {when}
            </Text>
          ) : null}
          {canRestore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Restore this ${kindLabel.toLowerCase()}`}
              accessibilityState={{ disabled: isRestoring }}
              disabled={isRestoring}
              onPress={() => {
                void haptic.impact();
                void handleRestore(item);
              }}
              style={({ pressed }) => [
                styles.restoreBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.04)",
                  opacity: pressed || isRestoring ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[styles.restoreText, { color: theme.colors.foreground }]}
              >
                {isRestoring ? "Restoring…" : "Restore"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [displayCurrency, theme, isDark, latestActionByRow, restoringId, handleRestore]
  );

  if (error) {
    return (
      <PageListStateScroll>
        <ErrorState
          title="Couldn't load the audit trail"
          description={error.message}
          onRetry={retry}
        />
      </PageListStateScroll>
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
      <PageListStateScroll>
        <EmptyState
          illustration="search"
          title="No edits or deletions yet"
          description="Changes to journal expenses and income will show up here with the previous and new values."
          tip="Soft-deleted rows stay on file. They leave History and balances, but this trail keeps the record."
        />
      </PageListStateScroll>
    );
  }

  return (
    <FlashList
      style={styles.list}
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: listBottomPadding }}
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
  reason: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: "italic",
  },
  restoreBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  restoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
  when: {
    fontSize: 11,
  },
});
