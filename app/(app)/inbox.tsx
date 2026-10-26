import { useCallback, useMemo, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import {
  Bell,
  CalendarClock,
  CreditCard,
  HandCoins,
  Landmark,
  PiggyBank,
  Repeat,
  Target,
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

/**
 * SPENDLY-569 — the reminders inbox the app-bar bell opens. Dues come from
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
  const { items, markAllSeen } = useRemindersInbox();

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

  const nothing = items.length === 0 && budgetItems.length === 0;

  return (
    <PageShell layout="readable">
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>
          Reminders
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          What's overdue or due in the next few days, and budgets that need a look.
        </Text>
      </View>

      {nothing ? (
        <EmptyState
          illustration="general"
          title="You're all caught up"
          description="Nothing is overdue or due in the next three days, and every budget is on track."
        />
      ) : (
        <View style={styles.sections}>
          {items.length > 0 ? (
            <Section title="Due" subtitle={`${items.length} need${items.length === 1 ? "s" : ""} attention`}>
              {items.map((item, i) => renderRow(item, i, items.length))}
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
