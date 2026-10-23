import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { CalendarClock, ChevronRight, Landmark, Repeat, Wallet } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import {
  DataRow,
  MetaLabel,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useAccounts } from "@/hooks/useAccounts";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSettings } from "@/providers/SettingsProvider";
import { OPEN_BILL_STATUSES } from "@/shared/types/creditCardBill";
import { formatDateKey } from "@/shared/utils/dates";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import {
  amountDueWithinDays,
  daysUntil,
  duesWithinDays,
  type UpcomingDueItem,
} from "@/shared/utils/spendlyBudget";
import {
  computeMonthlyCommitments,
  subscriptionsToUpcomingDues,
} from "@/shared/utils/subscriptionProcessor";
import { recurringHref } from "@/shared/utils/recurringDetail";
import { useTheme } from "@/theme/ThemeProvider";

export interface SubscriptionsWidgetProps {
  currency: string;
  extraDues?: UpcomingDueItem[];
}

const PREVIEW_LIMIT = 4;

function dueLabel(days: number): string {
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/**
 * Upcoming commitments (SPENDLY-533): the next dues across recurring
 * payments, open card bills and loans, with the 7-day and monthly totals as
 * real amounts. Same sources, same idle-deferred card/loan listeners, same
 * routes as before.
 */
export const SubscriptionsWidget = memo(function SubscriptionsWidget({
  currency,
  extraDues: explicitExtraDues,
}: SubscriptionsWidgetProps) {
  const { push } = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { subscriptions } = useSubscriptions();

  const shouldLoadExtraDues = explicitExtraDues === undefined;
  const [extraDuesActive, setExtraDuesActive] = useState(false);

  useEffect(() => {
    if (!shouldLoadExtraDues) return;
    return scheduleIdleWork(() => setExtraDuesActive(true));
  }, [shouldLoadExtraDues]);

  const { bills } = useCreditCardBills({
    enabled: shouldLoadExtraDues && extraDuesActive,
  });
  const { borrowings } = useBorrowings({
    enabled: shouldLoadExtraDues && extraDuesActive,
  });
  const { accounts } = useAccounts();
  const { settings } = useSettings();
  const todayKey = formatDateKey(new Date(), settings.timezone);

  const derivedExtraDues = useMemo((): UpcomingDueItem[] => {
    if (!extraDuesActive) return [];
    const accountNameById = new Map(
      accounts.map((account) => [account.id, account.name])
    );
    const cardDues: UpcomingDueItem[] = bills
      .filter(
        (bill) =>
          OPEN_BILL_STATUSES.includes(bill.status) && bill.remainingAmount > 0
      )
      .map((bill) => ({
        id: bill.id,
        name: accountNameById.get(bill.accountId) || "Credit card due",
        amount: bill.remainingAmount,
        dueDate: bill.dueDate,
        daysRemaining: daysUntil(bill.dueDate, todayKey),
        kind: "card" as const,
      }));
    const loanDues: UpcomingDueItem[] = borrowings
      .filter(
        (row) =>
          (row.status === "ACTIVE" ||
            row.status === "PARTIALLY_SETTLED" ||
            row.status === "OVERDUE") &&
          row.dueDate
      )
      .map((row) => ({
        id: row.id || row.lenderName,
        name: row.lenderName,
        amount:
          row.totalOutstanding ||
          row.outstandingPrincipal ||
          row.principalAmount ||
          0,
        dueDate: row.dueDate as string,
        daysRemaining: daysUntil(row.dueDate as string, todayKey),
        kind: "borrowing" as const,
      }));
    return [...cardDues, ...loanDues];
  }, [extraDuesActive, accounts, bills, borrowings, todayKey]);

  const extraDues = explicitExtraDues ?? derivedExtraDues;

  const commitments = useMemo(() => {
    return computeMonthlyCommitments(subscriptions);
  }, [subscriptions]);

  const preview = useMemo(() => {
    const recurring = subscriptionsToUpcomingDues(subscriptions);
    return duesWithinDays([...recurring, ...extraDues], 45).slice(0, PREVIEW_LIMIT);
  }, [extraDues, subscriptions]);

  const dueInSeven = useMemo(() => {
    const recurring = subscriptionsToUpcomingDues(subscriptions);
    return amountDueWithinDays([...recurring, ...extraDues], 7);
  }, [extraDues, subscriptions]);

  // SPENDLY-582: the Recurring Expenses overview, and an item's own detail.
  const openSubscriptions = () => push("/recurring" as Href);

  return (
    <Section
      title="Upcoming"
      subtitle={`${commitments.activeCount} active recurring`}
      icon={<Repeat size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={<SectionAction label="Manage" onPress={openSubscriptions} />}
    >
      <View style={[styles.summary, { backgroundColor: surfaces.tile }]}>
        <View style={styles.summaryItem}>
          <MetaLabel>Due in 7 days</MetaLabel>
          <FinancialAmount
            value={dueInSeven}
            currency={currency}
            size="md"
            weight="bold"
            tone={dueInSeven > 0 ? "default" : "muted"}
          />
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: surfaces.divider }]} />
        <View style={styles.summaryItem}>
          <MetaLabel>Every month</MetaLabel>
          <FinancialAmount value={commitments.totalMonthly} currency={currency} size="md" weight="bold" />
        </View>
      </View>

      {preview.length > 0 ? (
        <View style={styles.list}>
          {preview.map((item, idx) => {
            const Icon = item.kind === "card" ? Landmark : item.kind === "borrowing" ? Wallet : Repeat;
            const isImminent = item.daysRemaining <= 3;
            const tint = isImminent ? theme.colors.warning : theme.colors.primary;
            return (
              <DataRow
                key={`${item.kind}-${item.id}`}
                onPress={item.kind === "subscription" ? () => push(recurringHref(item.id) as Href) : openSubscriptions}
                divider={idx < preview.length - 1}
                leading={
                  <RowGlyph size={36} tint={surfaces.wash(tint)}>
                    <Icon size={15} color={tint} strokeWidth={2.2} />
                  </RowGlyph>
                }
                title={item.name}
                meta={
                  item.kind === "card" ? "Card bill" : item.kind === "borrowing" ? "Loan" : "Recurring"
                }
                value={
                  <FinancialAmount value={item.amount} currency={currency} size="sm" sign="minus" />
                }
                valueMeta={
                  <Text
                    style={[
                      styles.due,
                      {
                        color: isImminent ? theme.colors.warning : theme.colors.mutedForeground,
                        fontFamily: theme.fontFamily.medium,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {dueLabel(item.daysRemaining)}
                  </Text>
                }
                accessibilityLabel={`${item.name}, ${dueLabel(item.daysRemaining)}`}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <View style={[styles.emptyGlyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
            <CalendarClock size={18} color={theme.colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.emptyText}>
            <Text
              style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            >
              Nothing due soon
            </Text>
            <MetaLabel numberOfLines={2}>
              Repeating merchants like Netflix will show up here.
            </MetaLabel>
          </View>
        </View>
      )}
      {/* SPENDLY-179: every due date, by day */}
      <Pressable
        onPress={() => push("/calendar" as Href)}
        accessibilityRole="link"
        accessibilityLabel="View all commitments in the financial calendar"
        hitSlop={8}
        style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.linkText, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>
          View in calendar
        </Text>
        <ChevronRight size={14} color={theme.colors.primary} strokeWidth={2.4} />
      </Pressable>
    </Section>
  );
});

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
    marginBottom: 6,
  },
  summaryItem: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  list: {
    marginTop: 2,
  },
  due: {
    fontSize: 11,
    lineHeight: 15,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  emptyGlyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 14,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 32,
  },
  linkText: {
    fontSize: 13,
  },
});
