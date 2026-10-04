import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Store } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { listMerchantOverrides } from "@/services/merchant/merchantOverrideStore";
import { buildMerchantLedgerItems, buildMerchantProfiles, merchantProfileId } from "@/shared/utils/merchantGrouping";
import { transactionHref } from "@/shared/utils/transactionRef";
import { useTheme } from "@/theme/ThemeProvider";

type Period = "30d" | "90d" | "all";

export default function MerchantProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
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

  if (expensesLoading || incomesLoading) {
    return <PageShell><ActivityIndicator color={theme.colors.primary} style={{ marginTop: 80 }} /></PageShell>;
  }
  if (!profile) {
    return <PageShell><View style={styles.empty}><Store size={32} color={theme.colors.mutedForeground} /><Text style={{ color: theme.colors.foreground }}>Merchant not found</Text><Button variant="outline" onPress={() => router.back()}>Go back</Button></View></PageShell>;
  }

  return (
    <PageShell scrollable={false}>
      <PageHeader title={profile.displayName} subtitle="Merchant profile" icon={<Store size={22} color={theme.colors.primary} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.back}><Pressable onPress={() => router.back()} accessibilityRole="button"><ArrowLeft size={20} color={theme.colors.foreground} /></Pressable></View>
        <Card>
          <Text style={[styles.eyebrow, { color: theme.colors.mutedForeground }]}>{profile.category ?? "Category not confirmed"}{profile.subcategory ? ` › ${profile.subcategory}` : ""}</Text>
          <Amount value={total} currency={currency} style={[styles.total, { color: theme.colors.foreground }]} />
          <Text style={{ color: theme.colors.mutedForeground }}>{transactions.length} transaction{transactions.length === 1 ? "" : "s"} · {profile.confidence === "low" ? "might be this merchant" : `${profile.confidence} recognition`}</Text>
          {profile.recurring ? <Text style={[styles.recurring, { color: theme.colors.success }]}>Recurring pattern detected: {profile.recurring.frequency}</Text> : null}
        </Card>
        <View style={styles.periods}>{(["30d", "90d", "all"] as Period[]).map((value) => <Button key={value} size="sm" variant={period === value ? "primary" : "outline"} onPress={() => setPeriod(value)}>{value === "all" ? "All time" : `Last ${value.slice(0, -1)} days`}</Button>)}</View>
        <Card title="Recent transactions">
          {transactions.slice(0, 20).map((transaction) => <Pressable key={`${transaction.kind}:${transaction.id}`} onPress={() => router.push(transactionHref({ kind: transaction.kind, id: transaction.id }) as never)} style={styles.transaction}><View><Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{transaction.resolution.displayName}</Text><Text style={{ color: theme.colors.mutedForeground }}>{transaction.date} · {transaction.category ?? transaction.source.text}</Text></View><Amount value={transaction.kind === "expense" ? -transaction.amount : transaction.amount} currency={currency} style={{ color: theme.colors.foreground }} /></Pressable>)}
          {transactions.length === 0 ? <Text style={{ color: theme.colors.mutedForeground }}>No transactions in this period.</Text> : null}
        </Card>
        <Card title="Spend trend">
          {profile.spendTrend.slice(-12).map((point) => <View key={point.date} style={styles.trend}><Text style={{ color: theme.colors.mutedForeground }}>{point.date}</Text><Amount value={point.amount} currency={currency} style={{ color: theme.colors.foreground }} /></View>)}
        </Card>
      </ScrollView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 16, paddingBottom: 120 },
  back: { height: 32, justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  eyebrow: { fontSize: 13, marginBottom: 8 },
  total: { fontSize: 30, fontWeight: "800" },
  recurring: { marginTop: 10, fontWeight: "700" },
  periods: { flexDirection: "row", gap: 8 },
  transaction: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(128,128,128,0.25)" },
  trend: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
});
