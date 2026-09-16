import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { TokenLadduDraw } from "@/components/ganesh/tokenLaddu/TokenLadduDraw";
import { TokenLadduHero } from "@/components/ganesh/tokenLaddu/TokenLadduHero";
import { TokenLadduList } from "@/components/ganesh/tokenLaddu/TokenLadduList";
import { TokenLadduOverview } from "@/components/ganesh/tokenLaddu/TokenLadduOverview";
import { TokenLadduRegisterForm } from "@/components/ganesh/tokenLaddu/TokenLadduRegisterForm";
import { TokenLadduWinners } from "@/components/ganesh/tokenLaddu/TokenLadduWinners";
import { FilterChips, StatusStrip, type ChipOption } from "@/components/ganesh/ui";
import { useFestivals } from "@/hooks/useFestivals";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import {
  useTokenDrawResults,
  useTokenDrawSessions,
  useTokenLadduConfig,
  useTokenLadduTokens,
} from "@/hooks/useTokenLaddu";
import { useNetwork } from "@/providers/NetworkProvider";
import { usePandals } from "@/hooks/usePandals";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { exportTokenLadduPdf } from "@/services/ganesh/ganeshReportDelivery";
import { money } from "@/shared/utils/ganeshMath";
import { buildTokenLadduExport } from "@/shared/utils/ganeshTokenLadduExport";

type TokenTab = "overview" | "register" | "tokens" | "draw" | "winners";

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
  const { pandals } = usePandals();
  const { realUser } = useAuth();
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const writes = useGaneshWrites();

  const { config, configured, capacity, loading: configLoading } = useTokenLadduConfig(
    pandalId,
    festivalId
  );
  const { tokens, loading, error, retry } = useTokenLadduTokens(pandalId, festivalId);
  const {
    results,
    loading: resultsLoading,
    error: resultsError,
    retry: retryResults,
  } = useTokenDrawResults(pandalId, festivalId);
  const { sessions, openSession } = useTokenDrawSessions(pandalId, festivalId);
  const { isOnline } = useNetwork();

  const [tab, setTab] = useState<TokenTab>("overview");
  const [exporting, setExporting] = useState(false);

  const festival = festivals.find((item) => item.id === festivalId);
  const pandal = pandals.find((item) => item.id === pandalId);

  const canRead = can("tokens.read");
  const canConfigure = can("tokens.config");
  // The registration also writes a collection row, so both permissions are
  // genuinely required — the hook refuses without them, and hiding the tab
  // keeps that refusal from being a surprise at the end of a form.
  const canRegister = can("tokens.write") && can("collections.create") && !closed;
  const canDraw = can("draw.run") && !closed;

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

  const eligibleCount = useMemo(
    () => tokens.filter((token) => token.status === "eligible").length,
    [tokens]
  );

  // The session that matters is the open one; failing that, the most recent, so
  // a finished draw still shows its final state rather than offering a new one.
  const drawSession = openSession ?? sessions[0] ?? null;

  /**
   * The register, exported at whatever the data says right now.
   *
   * Built from the tokens already on screen rather than a fresh read, so the
   * PDF matches what the committee is looking at — KAN-125 asks for the export
   * to reflect the data available at the time of export, not a later snapshot.
   */
  const onExport = useCallback(() => {
    setExporting(true);
    const model = buildTokenLadduExport({
      pandalName: pandal?.name ?? "Pandal",
      festivalName: festival?.name ?? "Festival",
      festivalYear: festival?.year ?? undefined,
      generatedAt: new Date().toISOString(),
      generatedBy: realUser?.displayName || realUser?.phoneNumber || "A committee member",
      tokens,
      capacity,
    });
    exportTokenLadduPdf(model)
      .catch((error) => {
        logError("ganesh.tokenLadduExport", error, { rows: model.rows.length });
        toast.error(friendlyErrorMessage(error, "Could not export the Token Laddu register."));
      })
      .finally(() => setExporting(false));
  }, [pandal?.name, festival?.name, festival?.year, realUser, tokens, capacity]);

  const tabs = useMemo(() => {
    const options: Array<ChipOption<TokenTab>> = [{ id: "overview", label: "Overview" }];
    if (canRegister) options.push({ id: "register", label: "Register" });
    options.push({ id: "tokens", label: "Token Laddus", badge: tokens.length });
    if (canDraw) options.push({ id: "draw", label: "Draw" });
    options.push({ id: "winners", label: "Winners", badge: results.length });
    return options;
  }, [canRegister, canDraw, tokens.length, results.length]);

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
        {selected === "winners" ? (
          <TokenLadduWinners
            results={results}
            session={drawSession}
            loading={resultsLoading}
            error={resultsError}
            onRetry={retryResults}
            prefix={prefix}
          />
        ) : null}
        {selected === "tokens" ? (
          <TokenLadduList
            tokens={tokens}
            loading={loading || configLoading}
            error={error}
            onRetry={retry}
            canExport={canRead}
            exporting={exporting}
            onExport={onExport}
            prefix={prefix}
          />
        ) : selected === "winners" ? null : (
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
            {selected === "draw" ? (
              <TokenLadduDraw
                session={drawSession}
                configuredTokens={capacity.total}
                eligibleCount={eligibleCount}
                completedDraws={drawSession?.completedDraws ?? 0}
                canRun={canDraw}
                isOnline={isOnline}
                onOpenSession={(input) => writes.openTokenDrawSession(input)}
                onDraw={(sessionId) => writes.runTokenDraw(sessionId)}
                onCloseSession={(input) => writes.closeTokenDrawSession(input)}
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
