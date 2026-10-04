import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Search, Store } from "lucide-react-native";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui/Card";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { listMerchantOverrides } from "@/services/merchant/merchantOverrideStore";
import { buildMerchantLedgerItems, buildMerchantProfiles } from "@/shared/utils/merchantGrouping";
import { useTheme } from "@/theme/ThemeProvider";

export default function MerchantsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Awaited<ReturnType<typeof listMerchantOverrides>>>([]);

  useEffect(() => {
    if (!user?.uid) return;
    void listMerchantOverrides(user.uid).then(setOverrides).catch((error) => logError("merchantDirectory.load", error));
  }, [user?.uid]);

  const profiles = useMemo(() => buildMerchantProfiles(buildMerchantLedgerItems(expenses, incomes, overrides)), [expenses, incomes, overrides]);
  const filtered = profiles.filter((profile) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return true;
    return profile.displayName.toLocaleLowerCase().includes(needle) || profile.transactions.some((transaction) => transaction.source.text.toLocaleLowerCase().includes(needle) || transaction.resolution.normalized.includes(needle));
  });

  return <PageShell scrollable={false}>
    <PageHeader title="Merchants" subtitle="Grouped from your transactions" icon={<Store size={22} color={theme.colors.primary} />} />
    <View style={styles.search}><Search size={18} color={theme.colors.mutedForeground} /><TextInput value={query} onChangeText={setQuery} placeholder="Search merchants or aliases" placeholderTextColor={theme.colors.mutedForeground} style={{ flex: 1, color: theme.colors.foreground }} accessibilityLabel="Search merchants" /></View>
    <ScrollView contentContainerStyle={styles.content}>
      {filtered.map((profile) => <Card key={profile.merchantId} onPress={() => router.push(`/merchants/${encodeURIComponent(profile.merchantId)}` as never)} interactive><View style={styles.row}><View style={{ flex: 1 }}><Text style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 16 }}>{profile.displayName}</Text><Text style={{ color: theme.colors.mutedForeground }}>{profile.category ?? "Category not confirmed"} · {profile.transactionCount} transaction{profile.transactionCount === 1 ? "" : "s"}</Text></View><Text style={{ color: theme.colors.foreground, fontWeight: "800" }}>{profile.totalSpend.toFixed(2)}</Text></View></Card>)}
      {filtered.length === 0 ? <Text style={{ color: theme.colors.mutedForeground, textAlign: "center", padding: 24 }}>No merchants match this search.</Text> : null}
    </ScrollView>
  </PageShell>;
}

const styles = StyleSheet.create({
  search: { marginHorizontal: 16, marginBottom: 10, minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(128,128,128,0.12)" },
  content: { gap: 12, padding: 16, paddingBottom: 120 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
