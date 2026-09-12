import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, ChevronRight, CalendarClock } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpfContributions } from "@/hooks/useEpfContributions";
import { epfCurrentMonth } from "@/shared/features/epf/utils/epfClock";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";
import { isReconciled, projectionBlocker } from "@/shared/features/epf/utils/lifecycle";
import { wageForProjection } from "@/shared/features/epf/utils/schedule";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { monthLabel } from "@/shared/utils/monthLabel";

/**
 * "This month" on the EPF tab — KAN-68.
 *
 * The most-checked piece of EPF information, so it sits where the user lands
 * rather than two taps away. Shows a warning instead of a projection when there
 * is nothing to project from, which the ticket requires explicitly.
 */
export function EpfCurrentMonthCard({
  establishment,
  onOpen,
}: {
  establishment: EpfEstablishment | null;
  onOpen: (establishment: EpfEstablishment) => void;
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  const { contributions, contributionsLoading } = useEpfContributions(establishment?.id, {
    enabled: Boolean(establishment),
  });

  const money = useCallback((value: number) => formatAmount(value, currency), [currency]);
  const month = epfCurrentMonth();

  const latestWage = useMemo(() => wageForProjection(contributions), [contributions]);
  const blocker = projectionBlocker({
    hasCurrentEmployment: Boolean(establishment),
    latestWage,
  });

  const row = useMemo(
    () => contributions.find((item) => item.month === month) ?? null,
    [contributions, month]
  );

  if (!establishment || contributionsLoading) return null;

  if (blocker) {
    return (
      <Card>
        <View style={styles.warningRow}>
          <AlertTriangle size={theme.iconSize.md} color={theme.colors.destructive} />
          <View style={styles.warningText}>
            <Text style={[styles.title, { color: theme.colors.foreground }]}>
              {blocker === "no_wage" ? "Add a wage to project EPF" : "No current employment"}
            </Text>
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
              {blocker === "no_wage"
                ? `Record at least one month's EPF wage for ${establishment.employerName} and future months will be projected automatically.`
                : "Add the employer you currently work for to start tracking monthly contributions."}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => onOpen(establishment)} style={styles.cta}>
          <Text style={[styles.ctaText, { color: theme.colors.primary }]}>
            {blocker === "no_wage" ? "Add a month" : "Add employer"}
          </Text>
          <ChevronRight size={theme.iconSize.sm} color={theme.colors.primary} />
        </Pressable>
      </Card>
    );
  }

  const meta = row
    ? contributionStatusMeta(row.status, row.source, isReconciled(row))
    : null;

  return (
    <Card>
      <Pressable onPress={() => onOpen(establishment)} accessibilityRole="button">
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: theme.colors.primary + "1A" }]}>
            <CalendarClock size={theme.iconSize.md} color={theme.colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
              This month · {establishment.employerName}
            </Text>
            <Text style={[styles.title, { color: theme.colors.foreground }]}>
              {monthLabel(month, "long")}
            </Text>
          </View>
          <ChevronRight size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
        </View>

        {row && meta ? (
          <>
            <Text style={[styles.amount, { color: theme.colors.foreground }]}>
              {money(row.creditedAmount ?? row.epfCredit)}
            </Text>
            <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
              {meta.label}
              {row.expectedCreditFrom
                ? ` · expected ${row.expectedCreditFrom} – ${row.expectedCreditTo}`
                : ""}
            </Text>
          </>
        ) : (
          <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
            Not generated yet. It appears once the month is under way.
          </Text>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 2 },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 16, fontWeight: "600" },
  amount: { fontSize: 24, fontWeight: "700", marginTop: 12 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  warningRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  warningText: { flex: 1, gap: 2 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  ctaText: { fontSize: 13, fontWeight: "600" },
});
