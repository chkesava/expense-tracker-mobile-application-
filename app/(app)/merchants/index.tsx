import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Store } from "lucide-react-native";

import { SearchBar } from "@/components/common/SearchBar";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { DataRow, RowGlyph, Section } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useIncomes } from "@/hooks/useIncomes";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { listMerchantOverrides } from "@/services/merchant/merchantOverrideStore";
import { buildMerchantLedgerItems, buildMerchantProfiles } from "@/shared/utils/merchantGrouping";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export default function MerchantsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
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

  const emptyText = (title: string, body: string) => (
    <View style={styles.empty}>
      <RowGlyph size={44}>
        <Store size={20} color={theme.colors.mutedForeground} />
      </RowGlyph>
      <Text style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{body}</Text>
    </View>
  );

  return <PageShell contentContainerStyle={styles.content}>
    <PageHeader title="Merchants" subtitle="Grouped from your transactions" icon={<Store size={22} color={theme.colors.primary} />} />
    <View style={styles.search}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search merchants or aliases" accessibilityLabel="Search merchants" />
    </View>
      {profiles.length === 0 ? (
        emptyText("No merchants yet", "Merchants appear here once your transactions have a payee or description to group by.")
      ) : filtered.length === 0 ? (
        emptyText("No merchants match", "Try a shorter search, or search by the text on the bank statement.")
      ) : (
        <Section title={`${filtered.length} merchant${filtered.length === 1 ? "" : "s"}`} subtitle="Sorted by net spend">
          {filtered.map((profile, index) => {
            // totalSpend is expenses minus incomes, so a merchant that paid
            // you more than you spent shows as money in.
            const moneyIn = profile.totalSpend < 0;
            const count = `${profile.transactionCount} transaction${profile.transactionCount === 1 ? "" : "s"}`;
            const meta = profile.category ?? "Category not confirmed";
            return (
              <DataRow
                key={profile.merchantId}
                leading={
                  <RowGlyph tint={surfaces.tile}>
                    <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }}>
                      {profile.displayName.trim().charAt(0).toLocaleUpperCase() || "?"}
                    </Text>
                  </RowGlyph>
                }
                title={profile.displayName}
                meta={meta}
                value={
                  <FinancialAmount
                    value={moneyIn ? -profile.totalSpend : profile.totalSpend}
                    currency={currency}
                    size="sm"
                    sign={moneyIn ? "plus" : "none"}
                    tone={moneyIn ? "positive" : "default"}
                    weight="semibold"
                  />
                }
                valueMeta={<Text style={[styles.count, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{count}</Text>}
                divider={index < filtered.length - 1}
                onPress={() => router.push(`/merchants/${encodeURIComponent(profile.merchantId)}` as never)}
                accessibilityLabel={`${profile.displayName}, ${meta}, ${count}, ${moneyIn ? "net received" : "net spend"} ${money(Math.abs(profile.totalSpend))}`}
              />
            );
          })}
        </Section>
      )}
  </PageShell>;
}

const styles = StyleSheet.create({
  search: { marginBottom: 2 },
  content: { gap: 12 },
  count: { fontSize: 11.5 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16 },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
