import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { TokenLadduHero } from "@/components/ganesh/tokenLaddu/TokenLadduHero";
import { TokenLadduList } from "@/components/ganesh/tokenLaddu/TokenLadduList";
import { TokenLadduOverview } from "@/components/ganesh/tokenLaddu/TokenLadduOverview";
import { TokenLadduRegisterForm } from "@/components/ganesh/tokenLaddu/TokenLadduRegisterForm";
import { FilterChips, StatusStrip, type ChipOption } from "@/components/ganesh/ui";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import {
  useTokenDrawResults,
  useTokenLadduConfig,
  useTokenLadduTokens,
} from "@/hooks/useTokenLaddu";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { money } from "@/shared/utils/ganeshMath";

type TokenTab = "overview" | "register" | "tokens";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  other: "Other",
};

/**
 * Token Laddu — the whole lifecycle in one screen (KAN-125).
 *
 * Configure → Register → Export → Draw → Winners, without sending the operator
 * between screens mid-festival. The Draw and Winners tabs arrive with the
 * trusted draw endpoint; shipping them as empty shells first would put a button
 * on screen that cannot do what it says.
 *
 * Structure follows `funds.tsx`: the hero bleeds to the edges, the screen
 * itself does not scroll, and the inner list owns the scrolling so a long token
 * list stays smooth.
 */
export default function TokenLadduScreen() {
  const { back } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const writes = useGaneshWrites();

  const { config, configured, capacity, loading: configLoading } = useTokenLadduConfig(
    pandalId,
    festivalId
  );
  const { tokens, loading, error, retry } = useTokenLadduTokens(pandalId, festivalId);
  const { results } = useTokenDrawResults(pandalId, festivalId);

  const [tab, setTab] = useState<TokenTab>("overview");

  const festival = festivals.find((item) => item.id === festivalId);

  const canRead = can("tokens.read");
  const canConfigure = can("tokens.config");
  // The registration also writes a collection row, so both permissions are
  // genuinely required — the hook refuses without them, and hiding the tab
  // keeps that refusal from being a surprise at the end of a form.
  const canRegister = can("tokens.write") && can("collections.create") && !closed;

  const collected = useMemo(
    () => money(tokens.reduce((sum, token) => sum + Number(token.amount ?? 0), 0)),
    [tokens]
  );

  const byMethod = useMemo(() => {
    const buckets = new Map<string, { count: number; amount: number }>();
    for (const token of tokens) {
      const key = token.paymentMethod ?? "other";
      const current = buckets.get(key) ?? { count: 0, amount: 0 };
      buckets.set(key, {
        count: current.count + 1,
        amount: money(current.amount + Number(token.amount ?? 0)),
      });
    }
    return [...buckets.entries()].map(([key, value]) => ({
      label: METHOD_LABEL[key] ?? "Other",
      ...value,
    }));
  }, [tokens]);

  const winners = useMemo(
    () => tokens.filter((token) => token.status === "winner").length,
    [tokens]
  );

  const tabs = useMemo(() => {
    const options: Array<ChipOption<TokenTab>> = [{ id: "overview", label: "Overview" }];
    if (canRegister) options.push({ id: "register", label: "Register" });
    options.push({ id: "tokens", label: "Token Laddus", badge: tokens.length });
    return options;
  }, [canRegister, tokens.length]);

  if (!canRead) {
    return <GaneshWriteLock message="Your role cannot see Token Laddus." />;
  }

  const selected = tabs.some((option) => option.id === tab) ? tab : "overview";

  const prefix = (
    <View style={styles.prefix}>
      <FilterChips value={selected} options={tabs} onChange={setTab} />
      {closed ? <StatusStrip tone="warning" message={lockMessage} /> : null}
    </View>
  );

  return (
    <GaneshScreen scroll={false} contentContainerStyle={styles.bleed}>
      <TokenLadduHero
        festivalName={festival?.name}
        onBack={back}
        rightAccessory={<GaneshSyncChip onDark />}
      />

      <View style={styles.body}>
        {selected === "tokens" ? (
          <TokenLadduList
            tokens={tokens}
            loading={loading || configLoading}
            error={error}
            onRetry={retry}
            // Wired up with the PDF builder in the next phase.
            canExport={false}
            exporting={false}
            onExport={() => undefined}
            prefix={prefix}
          />
        ) : (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {prefix}
            {selected === "overview" ? (
              <TokenLadduOverview
                config={config}
                configured={configured}
                capacity={capacity}
                collected={collected}
                byMethod={byMethod}
                completedDraws={results.length}
                winners={winners}
                canConfigure={canConfigure && !closed}
                canRegister={canRegister}
                onRegister={() => setTab("register")}
                onSaveCapacity={(input) => writes.setTokenLadduCapacity(input)}
              />
            ) : null}
            {selected === "register" ? (
              <TokenLadduRegisterForm
                capacity={capacity}
                amountPerToken={config.amountPerToken}
                onRegister={(input) => writes.registerTokenLaddu(input)}
              />
            ) : null}
          </ScrollView>
        )}
      </View>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  bleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  prefix: {
    gap: 10,
    paddingBottom: 10,
  },
});
