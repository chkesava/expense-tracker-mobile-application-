/**
 * SPENDLY-110 — one transaction's own history.
 *
 * The Audit sub-tab lists every change across the whole ledger, which answers
 * "what happened lately" but not "what happened to *this* row". This renders
 * the second question, inside the transaction detail sheet.
 *
 * All the interpretation lives in `shared/utils/ledgerEventDiff.ts` so it is
 * testable; this file only lays it out.
 */

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useLedgerEvents } from "@/hooks/useLedgerEvents";
import type { LedgerEventKind } from "@/shared/types/ledgerEvent";
import {
  selectEventsForRow,
  summarizeLedgerEvent,
  type LedgerFieldChange,
} from "@/shared/utils/ledgerEventDiff";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

function eventTimestamp(createdAt: unknown): string {
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

function ChangeRow({ change }: { change: LedgerFieldChange }) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();

  const renderValue = (value: string | number | undefined) => {
    if (value === undefined) {
      return (
        <Text style={[styles.value, { color: theme.colors.mutedForeground }]}>
          not set
        </Text>
      );
    }
    if (change.isMoney && typeof value === "number") {
      return (
        <Amount
          value={value}
          currency={currency}
          ghostable
          style={[styles.value, { color: theme.colors.foreground }]}
        />
      );
    }
    return (
      <Text
        style={[styles.value, { color: theme.colors.foreground }]}
        numberOfLines={1}
      >
        {String(value)}
      </Text>
    );
  };

  return (
    <View style={styles.changeRow}>
      <Text style={[styles.changeLabel, { color: theme.colors.mutedForeground }]}>
        {change.label}
      </Text>
      <View style={styles.changeValues}>
        {renderValue(change.before)}
        <Text style={[styles.arrow, { color: theme.colors.mutedForeground }]}>
          →
        </Text>
        {renderValue(change.after)}
      </View>
    </View>
  );
}

export function JournalTransactionAudit({
  kind,
  docId,
}: {
  kind: LedgerEventKind;
  docId?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  // Scoped to this row, and only while the sheet is open.
  const { events, loading, error } = useLedgerEvents({
    enabled: Boolean(docId),
    docId,
  });

  const rowEvents = useMemo(
    () => selectEventsForRow(events, kind, docId),
    [events, kind, docId]
  );

  if (!docId) return null;

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={[styles.heading, { color: theme.colors.mutedForeground }]}>
          HISTORY
        </Text>
        <Skeleton height={44} borderRadius={theme.radius.lg} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.section}>
        <Text style={[styles.heading, { color: theme.colors.mutedForeground }]}>
          HISTORY
        </Text>
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          Couldn&apos;t load this transaction&apos;s history.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.colors.mutedForeground }]}>
        HISTORY
      </Text>

      {rowEvents.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          Never edited since it was added.
        </Text>
      ) : (
        rowEvents.map((event) => {
          const summary = summarizeLedgerEvent(event);
          const tone =
            summary.tone === "removed"
              ? theme.colors.destructive
              : summary.tone === "restored"
                ? theme.colors.success
                : theme.colors.primary;

          return (
            <View
              key={event.id}
              style={[
                styles.event,
                {
                  backgroundColor: surfaces.tile,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.eventHeader}>
                <View
                  style={[styles.chip, { backgroundColor: `${tone}22`, borderColor: tone }]}
                >
                  <Text style={[styles.chipText, { color: tone }]}>
                    {summary.label}
                  </Text>
                </View>
                <Text
                  style={[styles.time, { color: theme.colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {eventTimestamp(event.createdAt)}
                </Text>
              </View>

              <Text style={[styles.detail, { color: theme.colors.foreground }]}>
                {summary.detail}
              </Text>

              {summary.changes.map((change) => (
                <ChangeRow key={change.field} change={change} />
              ))}
            </View>
          );
        })
      )}
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
  empty: {
    fontSize: 12,
    lineHeight: 17,
  },
  event: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
  },
  time: {
    fontSize: 10,
    flexShrink: 1,
  },
  detail: {
    fontSize: 12,
    lineHeight: 17,
  },
  changeRow: {
    gap: 2,
  },
  changeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  changeValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  value: {
    fontSize: 12,
    flexShrink: 1,
  },
  arrow: {
    fontSize: 12,
  },
});
