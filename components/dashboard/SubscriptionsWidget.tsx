import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Landmark, Repeat, Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
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
import type { Subscription } from "@/shared/types/subscription";
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
import { useTheme } from "@/theme/ThemeProvider";

export interface SubscriptionsWidgetProps {
  currency: string;
  extraDues?: UpcomingDueItem[];
}

const PREVIEW_LIMIT = 4;

const TYPE_ICONS: Record<Subscription["type"], typeof Repeat> = {
  subscription: Repeat,
  emi: Landmark,
  transfer: Wallet,
};

function dueLabel(days: number): string {
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

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

  const openSubscriptions = () => push("/ledger?tab=subscriptions");

  return (
    <Section
      title="Upcoming Commitments"
      subtitle={
        dueInSeven > 0
          ? `${currency} ${dueInSeven.toLocaleString()} due in 7 days · ${currency} ${commitments.totalMonthly.toLocaleString()} / mo`
          : `${commitments.activeCount} active · ${currency} ${commitments.totalMonthly.toLocaleString()} / mo`
      }
      icon={<Repeat size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={<SectionAction label="Manage" onPress={openSubscriptions} />}
    >
      {preview.length > 0 ? (
        <View>
          {preview.map((item, idx) => {
            const Icon = item.kind === "card" ? Landmark : item.kind === "borrowing" ? Wallet : Repeat;
            const isImminent = item.daysRemaining <= 3;
            return (
              <DataRow
                key={`${item.kind}-${item.id}`}
                onPress={openSubscriptions}
                divider={idx < preview.length - 1}
                leading={
                  <RowGlyph size={34} tint={surfaces.tile}>
                    <Icon
                      size={15}
                      color={theme.colors.mutedForeground}
                      strokeWidth={2.2}
                    />
                  </RowGlyph>
                }
                title={item.name}
                value={
                  <Amount
                    value={item.amount}
                    currency={currency}
                    ghostable
                    style={{
                      fontSize: 14.5,
                      fontFamily: theme.fontFamily.semibold,
                      color: theme.colors.foreground,
                    }}
                  />
                }
                valueMeta={
                  <Text
                    style={[
                      styles.due,
                      {
                        color: isImminent
                          ? theme.colors.warning
                          : theme.colors.mutedForeground,
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
        <MetaLabel numberOfLines={2}>
          Repeating merchants like Netflix will show up here.
        </MetaLabel>
      )}
      {/* SPENDLY-179: every due date, by day */}
      <Pressable
        onPress={() => push("/calendar" as Href)}
        accessibilityRole="link"
        accessibilityLabel="View all commitments in the financial calendar"
        hitSlop={8}
        style={{ alignSelf: "flex-start", paddingTop: 8, minHeight: 32, justifyContent: "center" }}
      >
        <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.xs }}>
          View in calendar →
        </Text>
      </Pressable>
    </Section>
  );
});

const styles = StyleSheet.create({
  due: {
    fontSize: 11,
    lineHeight: 15,
  },
});
