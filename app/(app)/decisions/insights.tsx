import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Lightbulb } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Modal } from "@/components/common/Modal";
import { DecisionRow } from "@/components/decisions/DecisionRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useDecisions } from "@/hooks/useDecisions";
import type { MoneyDecision } from "@/shared/types/decision";
import { buildDecisionInsights } from "@/shared/utils/decisionInsights";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Patterns in the user's own decisions (SPENDLY-370). Each insight explains
 * how it was worked out and opens the decisions behind it. Descriptive only.
 */
export default function DecisionInsightsScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { decisions, byId, loading, error, retry } = useDecisions();
  const insights = useMemo(() => buildDecisionInsights(decisions), [decisions]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? insights.find((i) => i.id === openId) : undefined;
  const bottomPadding = usePageListBottomPadding();
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  const header = (
    <PageHeader
      title="Decision insights"
      subtitle="From your own decisions"
      icon={<Lightbulb size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/decisions" as Href))}
    />
  );

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your decisions" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading) {
    body = <LoadingState variant="list" count={4} />;
  } else if (insights.length === 0) {
    body = (
      <EmptyState
        illustration="expenses"
        title="Nothing to see yet"
        description="Insights appear once you've moved a few decisions past draft. They only ever describe your own history."
        primaryAction={{ label: "Back to decisions", onPress: () => router.replace("/decisions" as Href) }}
      />
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.sm }}>
        <Text style={muted}>Descriptive patterns only — Spendly doesn't rate your decisions or recommend products. Percentages appear once there's enough history to make them meaningful.</Text>
        {insights.map((i) => (
          <Pressable
            key={i.id}
            onPress={() => setOpenId(i.id)}
            accessibilityRole="button"
            accessibilityLabel={`${i.title}. ${i.body}`}
            accessibilityHint="Shows how this was worked out and the decisions behind it"
            style={({ pressed }) => [styles.row, { gap: theme.space.md, padding: theme.space.md, borderRadius: theme.radius.md, borderColor: theme.colors.border, backgroundColor: pressed ? surfaces.tile : theme.colors.card }]}
          >
            <Lightbulb size={18} color={theme.colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{i.title}</Text>
              <Text numberOfLines={3} style={muted}>{i.body}</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.mutedForeground} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open?.title} density="compact">
        {open ? (
          <View style={{ gap: theme.space.md }}>
            <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>{open.body}</Text>
            <View style={{ backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md, gap: 4 }}>
              <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>How this was worked out</Text>
              <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{open.basis}</Text>
            </View>
            <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>Decisions behind this ({open.decisionIds.length})</Text>
            <View style={{ marginHorizontal: -theme.space.lg }}>
              {open.decisionIds.slice(0, 40).map((id) => {
                const d = byId.get(id);
                return d ? (
                  <DecisionRow
                    key={id}
                    decision={d}
                    onPress={(x: MoneyDecision) => {
                      setOpenId(null);
                      router.push(`/decisions/${x.id}` as Href);
                    }}
                  />
                ) : null;
              })}
            </View>
          </View>
        ) : null}
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
});
