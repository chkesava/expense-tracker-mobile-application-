import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, Lightbulb, Repeat, Store, TrendingUp } from "lucide-react-native";

import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { DataRow, MetaLabel, Pill, RowGlyph, Section } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useIncomes } from "@/hooks/useIncomes";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { listMerchantOverrides } from "@/services/merchant/merchantOverrideStore";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { buildMerchantLedgerItems, buildMerchantProfiles } from "@/shared/utils/merchantGrouping";
import { buildMerchantInsights } from "@/shared/utils/merchantInsights";
import { transactionHref } from "@/shared/utils/transactionRef";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

type Period = "30d" | "90d" | "all";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export default function MerchantProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { user } = useAuth();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const [period, setPeriod] = useState<Period>("all");
  const [overrides, setOverrides] = useState<Awaited<ReturnType<typeof listMerchantOverrides>>>([]);

  useEffect(() => {
    if (!user?.uid) return;
    void listMerchantOverrides(user.uid).then(setOverrides).catch((error) => logError("merchantProfile.load", error));
  }, [user?.uid]);

  const profiles = useMemo(
    () => buildMerchantProfiles(buildMerchantLedgerItems(expenses, incomes, overrides)),
    [expenses, incomes, overrides],
  );
  const profile = profiles.find((candidate) => candidate.merchantId === decodeURIComponent(id ?? ""));
  const cutoff = period === "all" ? "" : new Date(Date.now() - (period === "30d" ? 30 : 90) * 86400000).toISOString().slice(0, 10);
  const transactions = profile?.transactions.filter((transaction) => !cutoff || transaction.date >= cutoff) ?? [];
  const total = transactions.reduce((sum, transaction) => sum + (transaction.kind === "expense" ? transaction.amount : -transaction.amount), 0);
  const insights = profile ? buildMerchantInsights(profile.transactions) : null;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/merchants" as never));
  const date = (value: string) => formatDisplayDate(value, settings?.dateFormat);

  if (expensesLoading || incomesLoading) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        <PageHeader title="Merchant" subtitle="Merchant profile" icon={<Store size={22} color={theme.colors.primary} />} onBack={goBack} />
        <DashboardSkeleton variant="hero" />
        <DashboardSkeleton variant="section" rows={4} />
      </PageShell>
    );
  }
  if (!profile) {
    return (
      <PageShell>
        <PageHeader title="Merchant" subtitle="Merchant profile" icon={<Store size={22} color={theme.colors.primary} />} onBack={goBack} />
        <View style={styles.empty}>
          <RowGlyph size={48}><Store size={22} color={theme.colors.mutedForeground} /></RowGlyph>
          <Text style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>Merchant not found</Text>
          <Text style={[styles.emptyBody, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            It may have been renamed or merged with another merchant.
          </Text>
          <Button variant="outline" onPress={goBack}>Go back</Button>
        </View>
      </PageShell>
    );
  }

  // `total` is expenses minus incomes, so a negative total is money in.
  const moneyIn = total < 0;
  const periodLabel = PERIODS.find((entry) => entry.value === period)?.label ?? "";

  return (
    <PageShell contentContainerStyle={styles.content}>
      <PageHeader title={profile.displayName} subtitle="Merchant profile" icon={<Store size={22} color={theme.colors.primary} />} onBack={goBack} />
        <Section
          title={profile.category ?? "Category not confirmed"}
          subtitle={profile.subcategory ?? undefined}
          badge={profile.recurring ? <Pill label={`Recurring · ${profile.recurring.frequency}`} tone="accent" /> : undefined}
        >
          <MetaLabel>{`${moneyIn ? "Net received" : "Net spend"} · ${periodLabel}`}</MetaLabel>
          <FinancialAmount
            value={moneyIn ? -total : total}
            currency={currency}
            size="xl"
            sign={moneyIn ? "plus" : "none"}
            tone={moneyIn ? "positive" : "default"}
            weight="bold"
          />
          <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
            {transactions.length} transaction{transactions.length === 1 ? "" : "s"} · {profile.confidence === "low" ? "might be this merchant" : profile.confidence === "unknown" ? "not yet recognised" : `${profile.confidence} recognition`}
          </Text>
        </Section>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods} accessibilityRole="tablist">
          {PERIODS.map((entry) => (
            <Chip
              key={entry.value}
              label={entry.label}
              selected={period === entry.value}
              appearance="outline"
              accessibilityRole="tab"
              haptic={period !== entry.value}
              onPress={() => setPeriod(entry.value)}
            />
          ))}
        </ScrollView>

        <Section title="Recent transactions" subtitle={transactions.length > 20 ? `Latest 20 of ${transactions.length}` : undefined}>
          {transactions.length === 0 ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>No transactions in this period.</Text>
          ) : (
            transactions.slice(0, 20).map((transaction, index, shown) => {
              const isExpense = transaction.kind === "expense";
              const meta = `${date(transaction.date)} · ${transaction.category ?? transaction.source.text}`;
              return (
                <DataRow
                  key={`${transaction.kind}:${transaction.id}`}
                  leading={
                    <RowGlyph tint={isExpense ? surfaces.tile : surfaces.wash(theme.colors.success)}>
                      {isExpense ? (
                        <ArrowUpRight size={16} color={theme.colors.foreground} />
                      ) : (
                        <ArrowDownLeft size={16} color={theme.colors.success} />
                      )}
                    </RowGlyph>
                  }
                  title={transaction.resolution.displayName}
                  meta={meta}
                  value={
                    <FinancialAmount
                      value={transaction.amount}
                      currency={currency}
                      size="sm"
                      sign={isExpense ? "minus" : "plus"}
                      tone={isExpense ? "default" : "positive"}
                      weight="semibold"
                    />
                  }
                  divider={index < shown.length - 1}
                  onPress={() => router.push(transactionHref({ kind: transaction.kind, id: transaction.id }) as never)}
                  accessibilityLabel={`${transaction.resolution.displayName}, ${meta}, ${isExpense ? "spent" : "received"} ${money(transaction.amount)}`}
                />
              );
            })
          )}
        </Section>

        {profile.spendTrend.length > 0 ? (
          <Section title="Spend trend" subtitle="Daily spend, latest 12 days with activity" icon={<TrendingUp size={16} color={theme.colors.info} />}>
            {profile.spendTrend.slice(-12).map((point, index, shown) => (
              <DataRow
                key={point.date}
                title={date(point.date)}
                value={<FinancialAmount value={point.amount} currency={currency} size="sm" weight="medium" />}
                divider={index < shown.length - 1}
              />
            ))}
          </Section>
        ) : null}

        {insights ? (
          <Section title="Observed patterns" icon={profile.recurring ? <Repeat size={16} color={theme.colors.primary} /> : <Lightbulb size={16} color={theme.colors.primary} />}>
            <View style={styles.observations}>
              {insights.observations.map((observation) => (
                <Text key={observation} style={[styles.observation, { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular }]}>
                  • {observation}
                </Text>
              ))}
            </View>
          </Section>
        ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24, paddingVertical: 48 },
  emptyTitle: { fontSize: 16 },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  meta: { fontSize: 13, lineHeight: 18 },
  periods: { flexDirection: "row", gap: 8 },
  observations: { gap: 8 },
  observation: { fontSize: 13.5, lineHeight: 19 },
});
