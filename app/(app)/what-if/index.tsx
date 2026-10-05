import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FlaskConical,
  Gift,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  Scissors,
  ShoppingBag,
} from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { useWhatIfScenarios } from "@/hooks/useWhatIfScenarios";
import { dateLabel } from "@/shared/utils/runwayView";
import { WHAT_IF_TEMPLATES, whatIfChangeGroups } from "@/shared/utils/whatIfDraft";
import type { WhatIfScenario } from "@/shared/utils/whatIfScenarios";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const TEMPLATE_ICONS: Record<string, typeof Banknote> = {
  salary: Banknote,
  purchase: ShoppingBag,
  loan: Landmark,
  goal: PiggyBank,
  cut: Scissors,
  bonus: Gift,
};

/**
 * What If home (SPENDLY-387): saved scenarios and starter templates.
 * Reached from the side menu. Nothing here touches real financial records.
 */
export default function WhatIfHomeScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();
  const { scenarios, loading, error, retry } = useWhatIfScenarios();
  const [showArchived, setShowArchived] = useState(false);

  const active = scenarios.filter((s) => !s.archived);
  const archived = scenarios.filter((s) => s.archived);

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radius.md,
  };

  const open = (s: WhatIfScenario) => router.push(`/what-if/${encodeURIComponent(s.id)}` as Href);

  const scenarioRow = (s: WhatIfScenario, last: boolean) => {
    const changes = whatIfChangeGroups(s).length;
    const summary = `${changes} ${changes === 1 ? "change" : "changes"} · ${s.durationMonths} months · saved ${dateLabel(s.reference.asOfDate)}`;
    return (
      <Pressable
        key={s.id}
        onPress={() => open(s)}
        accessibilityRole="button"
        accessibilityLabel={`${s.name}. ${summary}.${s.archived ? " Archived." : ""} Open scenario.`}
        style={({ pressed }) => [
          styles.row,
          { padding: theme.space.md, opacity: pressed ? 0.7 : 1 },
          !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
        ]}
      >
        <View style={[styles.iconBubble, { backgroundColor: surfaces.tile }]}>
          <FlaskConical size={18} color={s.archived ? theme.colors.mutedForeground : theme.colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[text, { fontFamily: theme.fontFamily.semibold }]} numberOfLines={1}>{s.name}</Text>
          <Text style={muted} numberOfLines={1}>{summary}</Text>
        </View>
        <ChevronRight size={18} color={theme.colors.mutedForeground} />
      </Pressable>
    );
  };

  const templates = (
    <View style={{ gap: theme.space.sm }}>
      <Text style={h2} accessibilityRole="header">Start from an idea</Text>
      <View style={styles.grid}>
        {WHAT_IF_TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICONS[t.id] ?? HandCoins;
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push(`/what-if/edit?template=${t.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={`${t.title}. ${t.description}`}
              style={({ pressed }) => [card, styles.tile, { padding: theme.space.md, opacity: pressed ? 0.7 : 1 }]}
            >
              <Icon size={20} color={theme.colors.primary} />
              <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{t.title}</Text>
              <Text style={muted}>{t.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your scenarios" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading) {
    body = <LoadingState variant="list" count={4} />;
  } else {
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }}>
        <View style={[card, { padding: theme.space.md, gap: theme.space.sm, backgroundColor: surfaces.tile }]}>
          <Text style={h2}>Try a money decision before you make it</Text>
          <Text style={text}>
            See how a raise, a purchase, a new EMI or a saving habit would change your balance and runway over the coming months.
          </Text>
          <Text style={muted}>Your real transactions, accounts and goals are never changed.</Text>
          <Button onPress={() => router.push("/what-if/edit" as Href)} accessibilityLabel="New scenario">
            <View style={styles.rowStart}>
              <Plus size={18} color={theme.colors.primaryForeground} />
              <Text style={{ color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold }}>New scenario</Text>
            </View>
          </Button>
        </View>

        {active.length ? (
          <View style={{ gap: theme.space.sm }}>
            <Text style={h2} accessibilityRole="header">Your scenarios</Text>
            <View style={card}>{active.map((s, i) => scenarioRow(s, i === active.length - 1))}</View>
          </View>
        ) : (
          <View style={[card, { padding: theme.space.md, gap: theme.space.xs }]}>
            <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>No saved scenarios yet</Text>
            <Text style={muted}>Pick an idea below, or start a new scenario. Save the ones you want to come back to.</Text>
          </View>
        )}

        {templates}

        {archived.length ? (
          <View style={{ gap: theme.space.sm }}>
            <Pressable
              onPress={() => setShowArchived((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`${showArchived ? "Hide" : "Show"} ${archived.length} archived ${archived.length === 1 ? "scenario" : "scenarios"}`}
              style={[styles.rowStart, { minHeight: 44 }]}
            >
              {showArchived ? <ChevronUp size={18} color={theme.colors.mutedForeground} /> : <ChevronDown size={18} color={theme.colors.mutedForeground} />}
              <Text style={[text, { color: theme.colors.mutedForeground }]}>{`Archived (${archived.length})`}</Text>
            </Pressable>
            {showArchived ? <View style={card}>{archived.map((s, i) => scenarioRow(s, i === archived.length - 1))}</View> : null}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="What If"
        subtitle="Plan before you decide"
        icon={<FlaskConical size={20} color={theme.colors.primary} />}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href))}
      />
      {body}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, gap: 6, minHeight: 112 },
});
