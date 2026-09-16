import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ticket, Trophy } from "lucide-react-native";

import { SearchBar } from "@/components/common/SearchBar";
import {
  FilterChips,
  GaneshEmptyState,
  LedgerRow,
  ListStateView,
  MetaLabel,
  useGaneshTokens,
  type ChipOption,
  type StatusKind,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import type { LoadFailure } from "@/lib/firestoreErrors";
import type { TokenLadduToken, TokenLadduTokenStatus } from "@/shared/types/ganeshTokenLaddu";

type StatusFilter = "all" | TokenLadduTokenStatus;

const STATUS_OPTIONS: Array<ChipOption<StatusFilter>> = [
  { id: "all", label: "All" },
  { id: "eligible", label: "In the draw" },
  { id: "winner", label: "Winners" },
  { id: "cancelled", label: "Cancelled" },
];

const BADGE: Record<TokenLadduTokenStatus, { kind: StatusKind; label: string }> = {
  eligible: { kind: "pending", label: "In the draw" },
  winner: { kind: "received", label: "Winner" },
  cancelled: { kind: "cancelled", label: "Cancelled" },
};

export type TokenLadduListProps = {
  tokens: TokenLadduToken[];
  loading: boolean;
  error: LoadFailure | null;
  onRetry: () => void;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
  prefix?: React.ReactNode;
};

/**
 * Every individual token, searchable.
 *
 * Filtering happens in memory rather than in the query. That is a deliberate
 * constraint, not laziness: `firestore.indexes.json` is a strict subset of the
 * live project, so a composite index added here would be a deploy hazard for
 * every other Ganesh query. A pandal's pot is hundreds of rows, which filters
 * instantly.
 */
/**
 * One token row, memoized.
 *
 * The badge array and the leading icon are built in here rather than inside
 * `renderItem`, because a fresh array or element on every parent render defeats
 * `LedgerRow`'s own `memo` — and this list can hold a couple of thousand rows.
 */
const TokenRow = memo(function TokenRow({
  token,
  accent,
  tint,
}: {
  token: TokenLadduToken;
  accent: string;
  tint: string;
}) {
  const badge = BADGE[token.status] ?? BADGE.eligible;
  return (
    <LedgerRow
      id={token.id}
      icon={
        token.status === "winner" ? (
          <Trophy size={18} color={accent} strokeWidth={2.2} />
        ) : (
          <Ticket size={18} color={accent} strokeWidth={2.2} />
        )
      }
      iconTint={tint}
      title={token.id}
      meta={`${token.participantName}${token.receiptNumberPhysical ? ` · Receipt ${token.receiptNumberPhysical}` : ""}`}
      badges={[badge]}
      amount={token.amount}
      amountSize="secondary"
      attribution={token.mobile}
      when={token.date}
      pending={token.pendingWrite}
    />
  );
});

export function TokenLadduList({
  tokens,
  loading,
  error,
  onRetry,
  canExport,
  exporting,
  onExport,
  prefix,
}: TokenLadduListProps) {
  const g = useGaneshTokens();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tokens.filter((token) => {
      if (status !== "all" && token.status !== status) return false;
      if (!needle) return true;
      // KAN-125 asks for token id, receipt, name, mobile and date to be
      // searchable. The token code and the receipt number are different
      // concepts and both have to match.
      return (
        token.id.toLowerCase().includes(needle) ||
        token.participantName?.toLowerCase().includes(needle) ||
        token.receiptNumberPhysical?.toLowerCase().includes(needle) ||
        token.mobile?.includes(needle) ||
        token.date?.includes(needle)
      );
    });
  }, [tokens, search, status]);

  const counts = useMemo(
    () => ({
      eligible: tokens.filter((token) => token.status === "eligible").length,
      winner: tokens.filter((token) => token.status === "winner").length,
      cancelled: tokens.filter((token) => token.status === "cancelled").length,
    }),
    [tokens]
  );

  // Hoisted so the row's memo sees a stable tint between renders.
  const accent = g.saffron;
  const tint = g.wash(g.saffron);
  const renderItem = useCallback(
    ({ item }: { item: TokenLadduToken }) => (
      <TokenRow token={item} accent={accent} tint={tint} />
    ),
    [accent, tint]
  );

  const header = (
    <View style={styles.header}>
      {prefix}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Token number, receipt, name or mobile"
      />
      <FilterChips
        value={status}
        options={STATUS_OPTIONS.map((option) =>
          option.id === "all"
            ? { ...option, badge: tokens.length }
            : { ...option, badge: counts[option.id as keyof typeof counts] }
        )}
        onChange={setStatus}
      />
      {canExport && tokens.length > 0 ? (
        <Button variant="secondary" loading={exporting} onPress={onExport}>
          Export all to PDF
        </Button>
      ) : null}
      {filtered.length > 0 ? (
        <MetaLabel>
          {filtered.length} of {tokens.length} Token {tokens.length === 1 ? "Laddu" : "Laddus"}
        </MetaLabel>
      ) : null}
    </View>
  );

  if (loading || error) {
    return (
      <ListStateView
        loading={loading}
        error={error}
        onRetry={onRetry}
        title={loading ? "Loading Token Laddus" : "We couldn't load the Token Laddus."}
        description={loading ? undefined : "Please check your connection and try again."}
        skeletonCount={5}
      />
    );
  }

  return (
    <FlashList
      data={filtered}
      keyExtractor={(token) => token.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        tokens.length === 0 ? (
          <GaneshEmptyState
            icon={<Ticket size={26} color={g.saffron} strokeWidth={2} />}
            title="No Token Laddus registered yet"
            description="Register the first purchase from the receipt book and every laddu gets its own number for the draw."
          />
        ) : (
          <GaneshEmptyState
            compact
            icon={<Ticket size={22} color={g.saffron} strokeWidth={2} />}
            title="Nothing matches that"
            description="Try a different number, name or receipt."
          />
        )
      }
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, paddingBottom: 10 },
});
