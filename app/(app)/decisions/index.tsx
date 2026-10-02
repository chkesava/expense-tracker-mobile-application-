import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, type Href } from "expo-router";
import { Plus, Scale, WifiOff } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { DecisionRow } from "@/components/decisions/DecisionRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useDecisions } from "@/hooks/useDecisions";
import { useNetwork } from "@/providers/NetworkProvider";
import type { MoneyDecision } from "@/shared/types/decision";
import { todayDateKey } from "@/shared/utils/dates";
import { DUE_LABELS, followUps } from "@/shared/utils/decisionCommitments";
import { sortDecisionsForList } from "@/shared/utils/decisionModel";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Money Decisions list (SPENDLY-363): drafts to resume first, then open and
 * past decisions. SPENDLY-368 turns this into the full history with search
 * and filters.
 */
export default function DecisionsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { isOnline } = useNetwork();
  const { decisions, loading, error, retry } = useDecisions();
  const sorted = useMemo(() => sortDecisionsForList(decisions), [decisions]);
  const bottomPadding = usePageListBottomPadding();
  const drafts = decisions.filter((d) => d.status === "draft").length;
  const comingUp = useMemo(() => followUps(decisions, todayDateKey()).slice(0, 5), [decisions]);

  const open = useCallback((d: MoneyDecision) => router.push((d.status === "draft" ? `/decisions/edit?id=${d.id}` : `/decisions/${d.id}`) as Href), [router]);
  const create = () => router.push("/decisions/edit" as Href);

  const header = (
    <PageHeader
      title="Money Decisions"
      subtitle={loading ? "Loading…" : decisions.length === 0 ? "Record why you chose" : `${decisions.length} ${decisions.length === 1 ? "decision" : "decisions"}${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}`}
      icon={<Scale size={20} color={theme.colors.primary} />}
      onBack={() => router.back()}
      rightElement={
        <Button variant="tonal" size="icon" onPress={create} accessibilityLabel="Log a new decision">
          <Plus size={20} color={theme.colors.primary} />
        </Button>
      }
    />
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your decisions" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={5} />;
  } else if (sorted.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="expenses"
          title="No decisions yet"
          description="Before a big money choice — a loan, a purchase, an investment — write down what you're deciding and why. Come back later to see how it turned out."
          primaryAction={{ label: "Log a decision", onPress: create }}
        />
      </PageListStateScroll>
    );
  } else {
    body = (
      <View style={styles.flex}>
        <FlashList
          data={sorted}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <DecisionRow decision={item} onPress={open} />}
          ListHeaderComponent={
            <View>
              {!isOnline ? (
                <View style={[styles.banner, { gap: theme.space.sm, paddingHorizontal: theme.space.lg }]}>
                  <WifiOff size={16} color={theme.colors.mutedForeground} />
                  <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                    You're offline. Changes save on this device and sync later.
                  </Text>
                </View>
              ) : null}
              {comingUp.length > 0 ? (
                <View style={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.sm, gap: theme.space.xs }} accessibilityRole="summary">
                  <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>Coming up</Text>
                  {comingUp.map((f) => (
                    <Text
                      key={f.key}
                      onPress={() => router.push(`/decisions/${f.decisionId}` as Href)}
                      accessibilityRole="link"
                      style={{ color: f.state === "overdue" ? theme.colors.destructive : theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs, paddingVertical: 4 }}
                    >
                      {DUE_LABELS[f.state]} · {f.kind === "review" ? `Review "${f.decisionTitle}"` : `${f.text} (${f.decisionTitle})`}
                      {f.date ? ` · ${f.date}` : ""}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          }
          contentContainerStyle={{ paddingBottom: bottomPadding }}
        />
      </View>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
});
