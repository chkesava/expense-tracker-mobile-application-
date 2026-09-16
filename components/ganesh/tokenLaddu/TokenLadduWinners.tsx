import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Trophy } from "lucide-react-native";

import {
  GaneshEmptyState,
  LedgerRow,
  ListStateView,
  MetaLabel,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import type { LoadFailure } from "@/lib/firestoreErrors";
import type { TokenDrawResult, TokenDrawSession } from "@/shared/types/ganeshTokenLaddu";

const WINNER_BADGE = [{ kind: "received" as const, label: "Winner" }];

/** Memoized so a long winners list does not re-render every row on each draw. */
const WinnerRow = memo(function WinnerRow({
  result,
  accent,
  tint,
}: {
  result: TokenDrawResult;
  accent: string;
  tint: string;
}) {
  return (
    <LedgerRow
      id={result.id}
      icon={<Trophy size={18} color={accent} strokeWidth={2.2} />}
      iconTint={tint}
      title={result.tokenId}
      meta={`${result.participantName}${result.receiptNumberPhysical ? ` · Receipt ${result.receiptNumberPhysical}` : ""}`}
      badges={WINNER_BADGE}
      attribution={`Draw ${result.sequence}`}
      when={result.drawnByName}
    />
  );
});

export type TokenLadduWinnersProps = {
  results: TokenDrawResult[];
  session: TokenDrawSession | null;
  loading: boolean;
  error: LoadFailure | null;
  onRetry: () => void;
  prefix?: React.ReactNode;
};

/**
 * Winners, in draw order.
 *
 * Ordered by sequence rather than write time, so a result committed after a
 * retry still reads in the order it was announced. Nothing here is editable:
 * the rules refuse every client write to a draw result, and this screen has no
 * business pretending otherwise.
 */
export function TokenLadduWinners({
  results,
  session,
  loading,
  error,
  onRetry,
  prefix,
}: TokenLadduWinnersProps) {
  const g = useGaneshTokens();
  const accent = g.saffron;
  const tint = g.wash(g.saffron);

  const renderItem = useCallback(
    ({ item }: { item: TokenDrawResult }) => (
      <WinnerRow result={item} accent={accent} tint={tint} />
    ),
    [accent, tint]
  );

  if (loading || error) {
    return (
      <ListStateView
        loading={loading}
        error={error}
        onRetry={onRetry}
        title={loading ? "Loading winners" : "We couldn't load the winners."}
        description={loading ? undefined : "Please check your connection and try again."}
        skeletonCount={4}
      />
    );
  }

  const shortfall = session?.shortfallAt != null;

  const header = (
    <View style={styles.header}>
      {prefix}
      {results.length > 0 ? (
        <MetaLabel>
          {results.length} {results.length === 1 ? "winner" : "winners"} drawn
          {session?.plannedDraws ? ` of ${session.plannedDraws}` : ""}
        </MetaLabel>
      ) : null}
      {shortfall ? (
        <StatusStrip
          tone="warning"
          message="The draw stopped early — there were fewer Token Laddus left than draws remaining."
        />
      ) : null}
      {session?.status === "completed" && !shortfall && results.length > 0 ? (
        <StatusStrip tone="positive" message="Every draw is complete." />
      ) : null}
    </View>
  );

  return (
    <FlashList
      data={results}
      keyExtractor={(result) => result.id}
      ListHeaderComponent={header}
      renderItem={renderItem}
      ListEmptyComponent={
        <GaneshEmptyState
          icon={<Trophy size={26} color={g.saffron} strokeWidth={2} />}
          title="No winners yet"
          description="Winners appear here as each Token Laddu is drawn, and stay here afterwards."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, paddingBottom: 10 },
});
