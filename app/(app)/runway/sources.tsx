import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Hourglass } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { RunwaySourceRow } from "@/components/runway/RunwaySourceRow";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useRunwaySources } from "@/hooks/useRunwaySources";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { setRunwayOverride } from "@/services/runway/runwayOverrideStore";
import type { RunwayResource } from "@/shared/types/runway";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { isRunwayDefault } from "@/shared/utils/runwayLabels";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Runway sources (SPENDLY-207): what counts toward Financial Runway and why.
 * Bank, cash and wallet count by default; near-liquid investments and
 * unrecognised accounts can be opted in; EPF, stocks, money owed to you,
 * cards and loans are locked. Choices never change balances or net worth.
 */
export default function RunwaySourcesScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const bottomPadding = usePageListBottomPadding();
  const { uid, sources, loading, error, retry } = useRunwaySources();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const onToggle = async (resource: RunwayResource, included: boolean) => {
    if (!uid) return;
    const key = `${resource.kind}:${resource.refId}`;
    setBusyKey(key);
    try {
      const outcome = await setRunwayOverride(uid, {
        kind: resource.kind,
        refId: resource.refId,
        included,
        isDefault: isRunwayDefault(resource, included),
      });
      if (outcome) toast.success(writeSavedMessage(outcome, included ? "Counted toward runway" : "No longer counted"));
    } catch (e) {
      logError("runway.override", e);
      toast.error(friendlyErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const header = (
    <PageHeader
      title="Runway sources"
      subtitle="What counts as spendable money"
      icon={<Hourglass size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/accounts" as never))}
    />
  );

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const sectionTitle = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, marginTop: theme.space.lg };

  const section = (title: string, hint: string, list: RunwayResource[]) =>
    list.length === 0 ? null : (
      <View>
        <Text style={sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={muted}>{hint}</Text>
        {list.map((r) => (
          <RunwaySourceRow
            key={`${r.kind}:${r.refId}`}
            resource={r}
            currency={currency}
            busy={busyKey === `${r.kind}:${r.refId}`}
            onToggle={onToggle}
          />
        ))}
      </View>
    );

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your runway choices" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading) {
    body = <LoadingState variant="list" count={5} />;
  } else if (sources.resources.length === 0) {
    body = <ErrorState title="Nothing to show yet" description="Add an account to see what counts toward your runway." retryLabel="Go back" onRetry={() => router.back()} />;
  } else {
    body = (
      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingBottom: bottomPadding }}>
        <View style={{ backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md, gap: 4, marginTop: theme.space.sm }}>
          <Text style={muted}>Counted toward runway</Text>
          <Text
            style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: theme.typography.xl }}
            accessibilityLabel={`Counted toward runway: ${formatAmount(sources.liquidTotal, currency)}`}
          >
            {formatAmount(sources.liquidTotal, currency)}
          </Text>
          <Text style={muted}>
            Runway is a planning estimate. These choices only affect runway — your balances and net worth stay the same.
          </Text>
        </View>
        {section("Counted", "Spendable money runway starts from.", sources.counted)}
        {section("Not counted", "Money you have that isn't treated as spendable. Switch on near-liquid items you could use.", sources.notCounted)}
        {section("You owe", "Amounts owed are never spendable money.", sources.obligations)}
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
    </PageShell>
  );
}
