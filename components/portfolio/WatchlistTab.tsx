import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowDown, ArrowUp, Eye, MoreHorizontal, Plus, Trash2 } from "lucide-react-native";

import { InstrumentSheet } from "@/components/markets/InstrumentSheet";
import { MarketBanner, MarketCard } from "@/components/markets/MarketParts";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useWatchlistQuotes } from "@/hooks/useWatchlistQuotes";
import { useWatchlists } from "@/hooks/useWatchlists";
import { appDialog } from "@/lib/appDialog";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import type { Instrument } from "@/shared/utils/marketsView";
import { displaySymbol } from "@/shared/utils/watchlists";
import {
  addSymbolPreview,
  watchlistRowInstrument,
  watchlistView,
  type WatchlistRowView,
} from "@/shared/utils/watchlistView";
import { useTheme } from "@/theme/ThemeProvider";

type NameForm = { mode: "create" } | { mode: "rename"; listId: string };

/**
 * Investment watchlists (SPENDLY-624, story SPENDLY-658): several named lists,
 * add / remove / reorder, one batched quote request per list, and the chart
 * sheet on tap. Mounted only while the Watchlist tab shows, so its listeners
 * and quote polling stop when the user leaves it.
 *
 * A watchlist is not a holding: nothing here reads or writes holdings, cash
 * or the ledger. `watchlistView` decides every state; this only draws it.
 */
export function WatchlistTab() {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const lists = useWatchlists();
  const symbols = useMemo(() => lists.entries.map((e) => e.yahooSymbol), [lists.entries]);
  const quotes = useWatchlistQuotes(symbols);

  const [showAdd, setShowAdd] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameForm, setNameForm] = useState<NameForm | null>(null);
  const [listName, setListName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Instrument | null>(null);

  const nowMs = Date.now();
  const view = watchlistView({
    lists: lists.lists,
    openListId: lists.openListId,
    entries: lists.entries,
    loading: lists.loading,
    loadError: lists.error?.message ?? null,
    setupError: lists.setupError,
    quotes: {
      rows: quotes.rows,
      label: quotes.label,
      isOffline: quotes.isOffline,
      errorMessage: quotes.errorMessage,
      fetching: quotes.query.isFetching,
    },
    nowMs,
  });
  const preview = addSymbolPreview(symbol, lists.entries);
  const quoteBySymbol = useMemo(() => new Map(quotes.rows.map((r) => [r.symbol, r.quote])), [quotes.rows]);

  const retry = () => {
    lists.retry();
    void quotes.query.refetch();
  };

  const closeAdd = () => {
    setShowAdd(false);
    setSymbol("");
    setName("");
    setAddError(null);
  };

  const openAdd = () => {
    setNameForm(null);
    setShowAdd(true);
  };

  const add = async () => {
    if (preview.kind !== "ok" || busy) return;
    setBusy(true);
    const result = await lists.add({ symbol: preview.yahooSymbol, name });
    setBusy(false);
    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    if (result.status === "exists") {
      setAddError("Already in this list.");
      return;
    }
    void haptic.success();
    toast.success(`Added ${displaySymbol(preview.yahooSymbol)}`);
    closeAdd();
  };

  const confirmRemove = (row: WatchlistRowView, listLabel: string) => {
    appDialog.show({
      title: `Remove ${row.ticker}?`,
      message: `${row.name} will be removed from ${listLabel}. You can add it again any time.`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void lists.remove(row.symbol).then((r) => {
              if (r.ok) toast.success(`Removed ${row.ticker}`);
              else toast.error(r.message);
            });
          },
        },
      ],
    });
  };

  const move = (row: WatchlistRowView, direction: "up" | "down") => {
    void haptic.selection();
    void lists.move(row.symbol, direction).then((r) => {
      if (!r.ok) toast.error(r.message);
    });
  };

  const openNameForm = (form: NameForm, initial: string) => {
    closeAdd();
    setNameForm(form);
    setListName(initial);
    setNameError(null);
  };

  const saveName = async () => {
    if (!nameForm || busy) return;
    setBusy(true);
    const result = nameForm.mode === "create" ? await lists.create(listName) : await lists.rename(nameForm.listId, listName);
    setBusy(false);
    if (!result.ok) {
      setNameError(result.message);
      return;
    }
    toast.success(nameForm.mode === "create" ? "Watchlist created" : "Watchlist renamed");
    setNameForm(null);
  };

  const confirmDeleteList = (open: { id: string; name: string }) => {
    appDialog.show({
      title: `Delete "${open.name}"?`,
      message: "The list and the stocks in it are removed. Your holdings are not affected.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void lists.removeList(open.id).then((r) => {
              if (!r.ok) {
                toast.error(r.message);
                return;
              }
              lists.selectList(null);
              toast.success("Watchlist deleted");
            });
          },
        },
      ],
    });
  };

  const listMenu = (open: { id: string; name: string; canDelete: boolean }) => {
    appDialog.actionMenu(open.name, [
      { text: "Rename", onPress: () => openNameForm({ mode: "rename", listId: open.id }, open.name) },
      ...(open.canDelete ? [{ text: "Delete list", style: "destructive" as const, onPress: () => confirmDeleteList(open) }] : []),
    ]);
  };

  const muted = { color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular };

  if (view.kind === "loading") {
    return (
      <MarketCard>
        <Text style={muted}>Loading your watchlists…</Text>
      </MarketCard>
    );
  }

  if (view.kind === "error") {
    return (
      <MarketCard>
        <View style={styles.empty}>
          <Eye size={32} color={theme.colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>{view.title}</Text>
          <Text style={[muted, styles.center]}>{view.description}</Text>
          <Button size="sm" onPress={retry}>Retry</Button>
        </View>
      </MarketCard>
    );
  }

  const listLabel = view.open.name;

  return (
    <View style={styles.container}>
      {view.chips.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {view.chips.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              selected={chip.selected}
              size="sm"
              appearance="tonal"
              accessibilityRole="tab"
              onPress={() => lists.selectList(chip.id)}
            />
          ))}
          {view.canCreateList ? (
            <Chip
              label="New list"
              size="sm"
              appearance="outline"
              icon={(c) => <Plus size={14} color={c} />}
              onPress={() => openNameForm({ mode: "create" }, "")}
              accessibilityLabel="Create a new watchlist"
            />
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{ color: theme.colors.foreground, fontSize: theme.typography.lg, fontFamily: theme.fontFamily.bold }}
          >
            {view.open.name}
          </Text>
          <Text style={muted} numberOfLines={2}>
            {view.quotesLabel ? `${view.open.countLabel} · ${view.quotesLabel}` : view.open.countLabel}
          </Text>
        </View>
        {view.chips.length > 0 ? (
          <Pressable
            onPress={() => listMenu(view.open)}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { borderColor: colors.border }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${view.open.name}`}
          >
            <MoreHorizontal size={18} color={theme.colors.foreground} />
          </Pressable>
        ) : null}
        <Button size="sm" onPress={showAdd ? closeAdd : openAdd} disabled={!!view.addBlocked && !showAdd}>
          <Plus size={15} color={theme.colors.primaryForeground} />
          <Text style={{ color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold }}>Add</Text>
        </Button>
      </View>
      {view.addBlocked ? <Text style={muted}>{view.addBlocked}</Text> : null}

      {nameForm ? (
        <MarketCard>
          <View style={styles.form}>
            <Input
              label={nameForm.mode === "create" ? "New watchlist name" : "Watchlist name"}
              value={listName}
              onChangeText={(t) => {
                setListName(t);
                setNameError(null);
              }}
              placeholder="e.g. Banks"
              maxLength={60}
              autoFocus
              error={nameError ?? undefined}
              onSubmitEditing={saveName}
            />
            <View style={styles.formActions}>
              <Button size="sm" variant="ghost" onPress={() => setNameForm(null)}>Cancel</Button>
              <Button size="sm" onPress={saveName} loading={busy}>{nameForm.mode === "create" ? "Create" : "Save"}</Button>
            </View>
          </View>
        </MarketCard>
      ) : null}

      {showAdd ? (
        <MarketCard>
          <View style={styles.form}>
            <Input
              label="Stock symbol"
              value={symbol}
              onChangeText={(t) => {
                setSymbol(t);
                setAddError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. TCS or RELIANCE.BO"
              autoFocus
              error={addError ?? (preview.kind === "invalid" || preview.kind === "exists" ? preview.message : undefined)}
              helperText={preview.kind === "ok" ? preview.hint : "NSE is assumed. Add .BO for BSE."}
              onSubmitEditing={add}
            />
            <Input label="Name (optional)" value={name} onChangeText={setName} placeholder="Tata Consultancy Services" maxLength={120} />
            <View style={styles.formActions}>
              <Button size="sm" variant="ghost" onPress={closeAdd}>Cancel</Button>
              <Button size="sm" onPress={add} loading={busy} disabled={preview.kind !== "ok"}>
                {`Add to ${listLabel}`}
              </Button>
            </View>
          </View>
        </MarketCard>
      ) : null}

      {view.banner ? <MarketBanner banner={view.banner} onRetry={retry} /> : null}

      {view.empty ? (
        <MarketCard>
          <View style={styles.empty}>
            <Eye size={32} color={theme.colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}>{view.empty.title}</Text>
            <Text style={[muted, styles.center]}>{view.empty.description}</Text>
            {!showAdd && !view.addBlocked ? (
              <Button size="sm" onPress={openAdd}>Add a stock</Button>
            ) : null}
          </View>
        </MarketCard>
      ) : (
        <MarketCard>
          {view.rows.map((row, i) => (
            <WatchRow
              key={row.symbol}
              row={row}
              last={i === view.rows.length - 1}
              onOpen={() => setSelected(watchlistRowInstrument(row, quoteBySymbol.get(row.symbol) ?? null))}
              onMove={(d) => move(row, d)}
              onRemove={() => confirmRemove(row, listLabel)}
            />
          ))}
        </MarketCard>
      )}

      <Text style={muted}>Prices from Yahoo Finance and may be delayed. A watchlist doesn't change your portfolio.</Text>

      <InstrumentSheet instrument={selected} onClose={() => setSelected(null)} showAddToWatchlist={false} />
    </View>
  );
}

function WatchRow({
  row,
  last,
  onOpen,
  onMove,
  onRemove,
}: {
  row: WatchlistRowView;
  last: boolean;
  onOpen: () => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const moveColor = colors.pnl(row.direction === "up" ? 1 : row.direction === "down" ? -1 : 0);
  const iconColor = (enabled: boolean) => (enabled ? theme.colors.foreground : theme.colors.border);
  const small = { color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular };

  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={row.accessibilityLabel}
        accessibilityHint="Opens the chart"
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <View style={styles.rowName}>
          <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold }} numberOfLines={1}>
            {row.ticker}
            <Text style={small}>{`  ${row.listing}`}</Text>
          </Text>
          <Text style={small} numberOfLines={1}>
            {row.name}
          </Text>
        </View>
        <View style={styles.rowFigures}>
          {row.price ? (
            <Text style={{ color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.medium, fontVariant: ["tabular-nums"] }}>
              {row.price}
            </Text>
          ) : null}
          {row.move ? (
            <Text style={{ color: moveColor, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.semibold, fontVariant: ["tabular-nums"] }}>
              {row.move}
            </Text>
          ) : null}
          {row.note ? (
            <Text style={small} numberOfLines={1}>
              {row.note}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.rowActions}>
        <Pressable
          onPress={() => onMove("up")}
          disabled={!row.canMoveUp}
          hitSlop={4}
          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Move ${row.ticker} up`}
          accessibilityState={{ disabled: !row.canMoveUp }}
        >
          <ArrowUp size={16} color={iconColor(row.canMoveUp)} />
        </Pressable>
        <Pressable
          onPress={() => onMove("down")}
          disabled={!row.canMoveDown}
          hitSlop={4}
          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Move ${row.ticker} down`}
          accessibilityState={{ disabled: !row.canMoveDown }}
        >
          <ArrowDown size={16} color={iconColor(row.canMoveDown)} />
        </Pressable>
        <Pressable
          onPress={onRemove}
          hitSlop={4}
          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${row.ticker} from the watchlist`}
        >
          <Trash2 size={16} color={theme.colors.destructive} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  chips: { gap: 8, paddingVertical: 2 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  form: { gap: 10 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 16 },
  emptyTitle: { fontSize: 16 },
  center: { textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  rowName: { flex: 1, minWidth: 0, gap: 2 },
  rowFigures: { alignItems: "flex-end", gap: 2, maxWidth: "55%" },
  rowActions: { flexDirection: "row", alignItems: "center" },
  smallBtn: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
});
