import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter, type Href } from "expo-router";
import { Lightbulb, Plus, Scale, SlidersHorizontal, WifiOff } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Modal } from "@/components/common/Modal";
import { SearchBar } from "@/components/common/SearchBar";
import { DecisionRow } from "@/components/decisions/DecisionRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useDecisions } from "@/hooks/useDecisions";
import { useNetwork } from "@/providers/NetworkProvider";
import { DECISION_CATEGORIES, type DecisionStatus, type MoneyDecision } from "@/shared/types/decision";
import { todayDateKey } from "@/shared/utils/dates";
import { DUE_LABELS, followUps } from "@/shared/utils/decisionCommitments";
import {
  EMPTY_DECISION_FILTERS,
  countActiveDecisionFilters,
  decisionTimeline,
  filterDecisions,
  type DecisionHistoryFilters,
  type DecisionSort,
  type OutcomeFilter,
  type ReviewFilter,
  type TimelineItem,
} from "@/shared/utils/decisionHistory";
import { decisionCategoryLabel } from "@/shared/utils/decisionModel";
import { useTheme } from "@/theme/ThemeProvider";

const QUICK: Array<{ id: string; label: string; statuses: DecisionStatus[] }> = [
  { id: "all", label: "All", statuses: [] },
  { id: "drafts", label: "Drafts", statuses: ["draft"] },
  { id: "open", label: "Open", statuses: ["considering", "decided", "tracking"] },
  { id: "done", label: "Reviewed & closed", statuses: ["reviewed", "closed"] },
  { id: "archived", label: "Archived", statuses: ["archived"] },
];

const SORTS: Array<{ id: DecisionSort; label: string }> = [
  { id: "decided", label: "Date decided" },
  { id: "updated", label: "Last updated" },
  { id: "created", label: "Date started" },
  { id: "title", label: "Title" },
];

const REVIEW: Array<{ id: ReviewFilter; label: string }> = [
  { id: "due", label: "Review due" },
  { id: "scheduled", label: "Review scheduled" },
  { id: "none", label: "No review date" },
  { id: "reviewed", label: "Reviewed" },
];

const OUTCOME: Array<{ id: OutcomeFilter; label: string }> = [
  { id: "recorded", label: "Outcome recorded" },
  { id: "awaiting", label: "Awaiting outcome" },
];

/**
 * Money Decisions history (SPENDLY-368): search, quick status filters, a
 * filter sheet, sorting and a month-grouped timeline. Archived decisions are
 * one chip away and always found by search.
 */
export default function DecisionsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { isOnline } = useNetwork();
  const { decisions, loading, error, retry } = useDecisions();
  const bottomPadding = usePageListBottomPadding();
  const today = todayDateKey();
  const [filters, setFilters] = useState<DecisionHistoryFilters>(EMPTY_DECISION_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const results = useMemo(() => filterDecisions(decisions, filters, today), [decisions, filters, today]);
  const timeline = useMemo(() => decisionTimeline(results, filters.sort), [results, filters.sort]);
  const comingUp = useMemo(() => followUps(decisions, today).slice(0, 5), [decisions, today]);
  const drafts = decisions.filter((d) => d.status === "draft").length;
  const quick = QUICK.find((q) => JSON.stringify(q.statuses) === JSON.stringify(filters.statuses))?.id ?? null;
  // Status shown by the quick chips doesn't count as a sheet filter.
  const active = countActiveDecisionFilters(filters) - (quick ? filters.statuses.length : 0);

  const open = useCallback((d: MoneyDecision) => router.push((d.status === "draft" ? `/decisions/edit?id=${d.id}` : `/decisions/${d.id}`) as Href), [router]);
  const create = () => router.push("/decisions/edit" as Href);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const header = (
    <PageHeader
      title="Money Decisions"
      subtitle={loading ? "Loading…" : decisions.length === 0 ? "Record why you chose" : `${decisions.length} ${decisions.length === 1 ? "decision" : "decisions"}${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}`}
      icon={<Scale size={20} color={theme.colors.primary} />}
      onBack={() => router.back()}
      rightElement={
        <View style={[styles.row, { gap: theme.space.xs }]}>
          {decisions.some((d) => d.status !== "draft") ? (
            <Button variant="ghost" size="icon" onPress={() => router.push("/decisions/insights" as Href)} accessibilityLabel="Decision insights">
              <Lightbulb size={20} color={theme.colors.primary} />
            </Button>
          ) : null}
          <Button variant="tonal" size="icon" onPress={create} accessibilityLabel="Log a new decision">
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        </View>
      }
    />
  );

  const controls = (
    <View style={{ paddingHorizontal: theme.space.lg, gap: theme.space.sm, paddingBottom: theme.space.sm }}>
      <SearchBar value={filters.query} onChangeText={(query) => setFilters({ ...filters, query })} placeholder="Search title, category, options, linked records" accessibilityLabel="Search decisions" />
      <View style={[styles.row, { gap: theme.space.sm }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} style={{ flex: 1 }} accessibilityRole="tablist">
          {QUICK.map((q) => (
            <Chip key={q.id} label={q.label} size="sm" selected={quick === q.id} onPress={() => setFilters({ ...filters, statuses: q.statuses })} accessibilityRole="tab" />
          ))}
        </ScrollView>
        <Chip
          label={active > 0 ? `Filters · ${active}` : "Filters"}
          size="sm"
          appearance="outline"
          selected={active > 0}
          icon={(color) => <SlidersHorizontal size={14} color={color} />}
          onPress={() => setSheetOpen(true)}
          accessibilityLabel={`Filters and sort${active ? `, ${active} active` : ""}`}
        />
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: TimelineItem }) =>
      item.type === "header" ? (
        <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.md, paddingBottom: theme.space.xs }} accessibilityRole="header">
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {item.label} · {item.count}
          </Text>
        </View>
      ) : (
        <DecisionRow decision={item.decision} onPress={open} />
      ),
    [open, theme]
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
  } else if (decisions.length === 0) {
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
      <>
        {controls}
        {results.length === 0 ? (
          <PageListStateScroll>
            <EmptyState
              compact
              title="No decisions match"
              description={filters.statuses.includes("archived") ? "Nothing is archived yet." : "Try other words, or clear the filters."}
              primaryAction={{ label: "Clear search and filters", onPress: () => setFilters(EMPTY_DECISION_FILTERS) }}
            />
          </PageListStateScroll>
        ) : (
          <View style={styles.flex}>
            <FlashList
              data={timeline}
              keyExtractor={(i) => i.key}
              getItemType={(i) => i.type}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View>
                  {!isOnline ? (
                    <View style={[styles.row, { gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingVertical: 8 }]}>
                      <WifiOff size={16} color={theme.colors.mutedForeground} />
                      <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
                        You're offline. Changes save on this device and sync later.
                      </Text>
                    </View>
                  ) : null}
                  {comingUp.length > 0 && !filters.query ? (
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
        )}
      </>
    );
  }

  const group = (title: string, children: React.ReactNode) => (
    <View style={{ gap: theme.space.sm }}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</Text>
      <View style={[styles.wrap, { gap: theme.space.sm }]}>{children}</View>
    </View>
  );

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
      <Modal isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter and sort" density="compact">
        <View style={{ gap: theme.space.lg }}>
          {group("Sort by", SORTS.map((s) => <Chip key={s.id} label={s.label} size="sm" selected={filters.sort === s.id} onPress={() => setFilters({ ...filters, sort: s.id })} accessibilityRole="radio" />))}
          {group("Category", DECISION_CATEGORIES.map((c) => <Chip key={c} label={decisionCategoryLabel(c)} size="sm" selected={filters.categories.includes(c)} onPress={() => setFilters({ ...filters, categories: toggle(filters.categories, c) })} />))}
          {group("Review", REVIEW.map((r) => <Chip key={r.id} label={r.label} size="sm" selected={filters.review.includes(r.id)} onPress={() => setFilters({ ...filters, review: toggle(filters.review, r.id) })} />))}
          {group("Outcome", OUTCOME.map((o) => <Chip key={o.id} label={o.label} size="sm" selected={filters.outcome.includes(o.id)} onPress={() => setFilters({ ...filters, outcome: toggle(filters.outcome, o.id) })} />))}
          {group("Archived", [<Chip key="arch" label="Include archived decisions" size="sm" selected={filters.includeArchived} onPress={() => setFilters({ ...filters, includeArchived: !filters.includeArchived })} />])}
          <View style={{ gap: theme.space.sm }}>
            <Button variant="primary" onPress={() => setSheetOpen(false)}>Show {results.length} {results.length === 1 ? "decision" : "decisions"}</Button>
            <Button variant="ghost" onPress={() => setFilters({ ...EMPTY_DECISION_FILTERS, query: filters.query })}>Clear filters</Button>
          </View>
        </View>
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
