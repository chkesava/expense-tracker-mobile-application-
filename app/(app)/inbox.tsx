import { useCallback, useMemo, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import {
  Bell,
  BellRing,
  CalendarClock,
  CreditCard,
  HandCoins,
  Landmark,
  PiggyBank,
  Repeat,
  Target,
  TrendingUp,
  Users,
} from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { DataRow, RowGlyph, Section, useSurfaces } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useDashboardCashFlow } from "@/hooks/useDashboardCashFlow";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useRemindersInbox } from "@/providers/RemindersInboxProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { computeActiveCategoryBudgets } from "@/shared/utils/dashboardWidgets";
import { currentMonthKey } from "@/shared/utils/dates";
import { budgetInboxItems, type InboxItem } from "@/shared/utils/remindersInbox";
import { notificationRowHref, timeAgoLabel, type NotificationRow } from "@/shared/utils/notificationRows";
import { useTheme } from "@/theme/ThemeProvider";

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const SOURCE_ICONS: Partial<Record<InboxItem["source"], IconType>> = {
  card_bill: CreditCard,
  subscription: Repeat,
  emi: Landmark,
  borrowing: Landmark,
  receivable: HandCoins,
  reminder: Bell,
  budget: Target,
  goal: PiggyBank,
};

/** SPENDLY-230: icons for the stored notification rows, by category or type. */
function updateIcon(row: NotificationRow): IconType {
  if (row.category === "investments" || row.type.startsWith("sip_") || row.type.startsWith("epf_")) return TrendingUp;
  if (row.category === "shared") return Users;
  if (row.category === "priceAlerts") return BellRing;
  if (row.category === "bills") return CreditCard;
  return Bell;
}

/**
 * SPENDLY-569 — the reminders inbox the app-bar bell opens. SPENDLY-230 adds
 * "Updates": the stored notification rows (SIP runs today; the server's
 * SIP/EPF, shared and price-alert notices later), whose read state is shared
 * across devices. Dues come from
 * the shell's `RemindersInboxProvider` (the same calendar events the local
 * notifications use); budget alerts are read here only, while the screen is
 * open (SPENDLY-406). Opening the screen marks the current dues as seen on
 * this device. Every row opens the record it came from.
 */
export default function RemindersInboxScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const { items, updates, markAllSeen, markUpdateRead } = useRemindersInbox();
  const nowMs = Date.now();

  useFocusEffect(
    useCallback(() => {
      markAllSeen();
    }, [markAllSeen])
  );

  const month = currentMonthKey(settings.timezone);
  const { summaries } = useDashboardCashFlow(month, 1);
  const { budgets } = useCategoryBudgets();
  const budgetItems = useMemo(() => {
    const totals = summaries.find((s) => s.period === month)?.categoryTotals ?? {};
    return budgetInboxItems(computeActiveCategoryBudgets(budgets ?? [], totals, month), month, currency);
  }, [summaries, budgets, month, currency]);

  const toneColor = (tone: InboxItem["tone"]) =>
    tone === "overdue" || tone === "over"
      ? theme.colors.destructive
      : tone === "warning"
        ? theme.colors.warning
        : theme.colors.primary;

  const renderRow = (item: InboxItem, index: number, count: number) => {
    const Icon = SOURCE_ICONS[item.source] ?? CalendarClock;
    const tint = toneColor(item.tone);
    return (
      <DataRow
        key={item.id}
        divider={index < count - 1}
        onPress={() => router.push(item.href as Href)}
        leading={
          <RowGlyph size={38} tint={surfaces.wash(tint)}>
            <Icon size={17} color={tint} strokeWidth={2.3} />
          </RowGlyph>
        }
        title={item.title}
        meta={item.subtitle}
        value={
          item.amount !== null ? (
            <FinancialAmount value={item.amount} currency={item.currency} size="sm" fit={false} />
          ) : undefined
        }
        accessibilityLabel={`${item.title}. ${item.subtitle}. Open`}
      />
    );
  };

  const renderUpdate = (row: NotificationRow, index: number, count: number) => {
    const Icon = updateIcon(row);
    const tint = row.read ? theme.colors.mutedForeground : theme.colors.primary;
    const href = notificationRowHref(row);
    const when = timeAgoLabel(row.createdAtMs, nowMs);
    const meta = [row.read ? null : "New", row.body, when].filter(Boolean).join(" · ");
    return (
      <DataRow
        key={row.id}
        divider={index < count - 1}
        onPress={() => {
          if (!row.read) markUpdateRead(row.id);
          if (href) router.push(href as Href);
        }}
        leading={
          <RowGlyph size={38} tint={surfaces.wash(tint)}>
            <Icon size={17} color={tint} strokeWidth={2.3} />
          </RowGlyph>
        }
        title={row.title}
        meta={meta}
        accessibilityLabel={`${row.read ? "" : "New. "}${row.title}. ${row.body}. ${when}`}
      />
    );
  };

  const nothing = items.length === 0 && budgetItems.length === 0 && updates.length === 0;

  return (
    <PageShell layout="readable">
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
          Inbox
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          What's overdue or due in the next few days, recent updates, and budgets that need a look.
        </Text>
      </View>

      {nothing ? (
        <EmptyState
          illustration="general"
          title="You're all caught up"
          description="Nothing is overdue or due in the next three days, there are no new updates, and every budget is on track."
        />
      ) : (
        <View style={styles.sections}>
          {items.length > 0 ? (
            <Section title="Due" subtitle={`${items.length} need${items.length === 1 ? "s" : ""} attention`}>
              {items.map((item, i) => renderRow(item, i, items.length))}
            </Section>
          ) : null}
          {updates.length > 0 ? (
            <Section title="Updates" subtitle="SIPs, EPF and shared money">
              {updates.map((row, i) => renderUpdate(row, i, updates.length))}
            </Section>
          ) : null}
          {budgetItems.length > 0 ? (
            <Section title="Budgets" subtitle="This month">
              {budgetItems.map((item, i) => renderRow(item, i, budgetItems.length))}
            </Section>
          ) : null}
        </View>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 14,
    gap: 4,
  },
  title: {
    fontSize: 26,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  sections: {
    gap: 12,
  },
});
