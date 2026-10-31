import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Eye, Plus, Trash2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWatchlistQuotes } from "@/hooks/useWatchlistQuotes";
import { useWatchlists } from "@/hooks/useWatchlists";
import { toast } from "@/lib/toast";
import { displaySymbol } from "@/shared/utils/watchlists";
import { formatSignedPercent } from "@/shared/utils/investmentPresentation";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";

export interface WatchlistTabProps {
  currency: string;
}

/**
 * The open watchlist (SPENDLY-657 moved it onto `users/{uid}/watchlists`; the
 * full redesign is SPENDLY-658). Mounted only while the Watchlist tab shows,
 * so its listeners and quote polling stop when the user leaves it.
 */
export function WatchlistTab({ currency }: WatchlistTabProps) {
  const lists = useWatchlists();
  const symbols = useMemo(() => lists.entries.map((e) => e.yahooSymbol), [lists.entries]);
  const { rows } = useWatchlistQuotes(symbols);
  const quoteBySymbol = useMemo(() => new Map(rows.map((r) => [r.symbol, r.quote])), [rows]);
  const watchlist = useMemo(
    () => lists.entries.map((e) => ({ id: e.yahooSymbol, yahooSymbol: e.yahooSymbol, symbol: displaySymbol(e.yahooSymbol), name: e.name })),
    [lists.entries]
  );
  const { theme } = useTheme();
  const surfaces = useSurfaces();
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
    const result = await lists.add({ symbol, name });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if ("status" in result && result.status === "exists") {
      toast.info("Already in watchlist");
      return;
    }
    toast.success("Added to watchlist");
    setSymbol("");
    setName("");
    setError(null);
    setShowForm(false);
  };

  const remove = async (yahooSymbol: string) => {
    const result = await lists.remove(yahooSymbol);
    if (result.ok) toast.success("Removed from watchlist");
    else toast.error(result.message);
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

      {lists.error || lists.setupError ? (
        <Card>
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptySubtitle, { color: theme.colors.mutedForeground }]}>{lists.error?.message ?? lists.setupError}</Text>
            <Button size="sm" onPress={lists.retry}>Retry</Button>
          </View>
        </Card>
      ) : null}

      {lists.loading && watchlist.length === 0 ? null : watchlist.length === 0 ? (
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
            const quote = quoteBySymbol.get(item.yahooSymbol);
            const price = quote?.price ?? 0;
            const changePercent = quote?.changePercent ?? 0;
            return (
              <View key={item.id} style={[styles.item, { borderColor: theme.colors.border, backgroundColor: surfaces.tile }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "800" }}>{item.symbol}</Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {price > 0 ? <><Amount value={price} currency={quote?.currency ?? currency} ghostable style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "800" }} /><Text style={{ color: changePercent > 0 ? theme.colors.success : changePercent < 0 ? theme.colors.destructive : theme.colors.mutedForeground, fontSize: 11, fontWeight: "700" }}>{formatSignedPercent(changePercent, 2)}</Text></> : <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>No quote</Text>}
                </View>
                <Pressable onPress={() => { haptic.selection().catch(() => undefined); void remove(item.yahooSymbol); }} style={styles.removeButton} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.symbol} from watchlist`}><Trash2 size={15} color={theme.colors.destructive} /></Pressable>
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
