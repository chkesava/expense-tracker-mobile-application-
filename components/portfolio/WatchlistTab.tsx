import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Eye, Plus, Trash2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { watchlistSchema } from "@/shared/features/portfolio/schemas";
import type { MarketQuote, WatchlistItem } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export interface WatchlistTabProps {
  watchlist: WatchlistItem[];
  quotes: Map<string, MarketQuote>;
  currency: string;
  onAdd: (item: Omit<WatchlistItem, "id" | "createdAt">) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export function WatchlistTab({ watchlist, quotes, currency, onAdd, onRemove }: WatchlistTabProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return watchlist;
    return watchlist.filter((item) => item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query));
  }, [search, watchlist]);

  const add = async () => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const parsed = watchlistSchema.safeParse({
      symbol: normalizedSymbol,
      yahooSymbol: normalizedSymbol.endsWith(".NS") || normalizedSymbol.endsWith(".BO") ? normalizedSymbol : `${normalizedSymbol}.NS`,
      name: name.trim() || normalizedSymbol,
      exchange: "NSE",
      instrumentType: "stock",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid watchlist item");
      return;
    }
    if (await onAdd(parsed.data)) {
      setSymbol("");
      setName("");
      setError(null);
      setShowForm(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Eye size={18} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "800" }}>Watchlist</Text>
        </View>
        <Button size="sm" onPress={() => setShowForm((current) => !current)}>
          <Plus size={15} color={theme.colors.primaryForeground} />
          <Text style={{ color: theme.colors.primaryForeground, fontWeight: "700" }}>Add</Text>
        </Button>
      </View>

      {showForm ? (
        <View style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Input label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" placeholder="e.g. TCS" />
          <Input label="Name (optional)" value={name} onChangeText={setName} placeholder="Tata Consultancy Services" error={error ?? undefined} />
          <Button onPress={add}>Add to watchlist</Button>
        </View>
      ) : null}

      {watchlist.length === 0 ? (
        <Card>
          <View style={styles.emptyContainer}>
            <Eye size={40} color={theme.colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>Your watchlist is empty</Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.mutedForeground }]}>Add a symbol to start tracking its market price.</Text>
          </View>
        </Card>
      ) : (
        <>
          <Input value={search} onChangeText={setSearch} placeholder="Search watchlist..." />
          {filtered.map((item) => {
            const quote = quotes.get(item.yahooSymbol);
            const price = quote?.currentPrice ?? 0;
            const change = quote?.dayChange ?? 0;
            const changePercent = quote?.dayChangePercent ?? 0;
            const positive = change >= 0;
            return (
              <View key={item.id} style={[styles.item, { borderColor: theme.colors.border, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "800" }}>{item.symbol}</Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {price > 0 ? <><Amount value={price} currency={currency} ghostable style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "800" }} /><Text style={{ color: positive ? "#10B981" : "#EF4444", fontSize: 11, fontWeight: "700" }}>{positive ? "+" : ""}{changePercent.toFixed(2)}%</Text></> : <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>No quote</Text>}
                </View>
                <Pressable onPress={() => { haptic.selection().catch(() => undefined); void onRemove(item.id); }} style={styles.removeButton} hitSlop={8}><Trash2 size={15} color={theme.colors.destructive} /></Pressable>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  form: { gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  emptyContainer: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySubtitle: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  item: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1, padding: 12 },
  removeButton: { marginLeft: 4, padding: 6 },
});
