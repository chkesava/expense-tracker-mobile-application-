import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { FlaskConical, MoreVertical, Pencil, RefreshCw } from "lucide-react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Modal } from "@/components/common/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WhatIfResults } from "@/components/whatIf/WhatIfResults";
import { useWhatIfBaseline } from "@/hooks/useWhatIfBaseline";
import { useWhatIfScenarios } from "@/hooks/useWhatIfScenarios";
import { appDialog } from "@/lib/appDialog";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage, type WriteOutcome } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import {
  deleteWhatIfScenario,
  duplicateWhatIfScenario,
  rebaseWhatIfScenario,
  recordWhatIfScenarioCalculation,
  renameWhatIfScenario,
  setWhatIfScenarioArchived,
} from "@/services/whatIf/whatIfScenarioStore";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { dateLabel } from "@/shared/utils/runwayView";
import { WHAT_IF_CHANGE_INFO, whatIfChangeGroups } from "@/shared/utils/whatIfDraft";
import { WHAT_IF_SCENARIO_NAME_MAX, whatIfRecalculationStatus, type WhatIfHistoryAction } from "@/shared/utils/whatIfScenarios";
import { runWhatIf } from "@/shared/utils/whatIfView";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const HISTORY_LABELS: Record<WhatIfHistoryAction, string> = {
  created: "Created",
  edited: "Edited",
  renamed: "Renamed",
  archived: "Archived",
  restored: "Restored",
  duplicated: "Copied from another scenario",
  rebased: "Updated to that day's data",
};

const SOURCE_LABELS: Record<string, string> = {
  accounts: "account balances",
  expenses: "expenses",
  incomes: "income",
  subscriptions: "subscriptions and EMIs",
  card_bills: "card bills",
  calendar: "scheduled commitments",
};

const timeLabel = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * A saved What-If scenario (SPENDLY-387): results recalculated from today's
 * data, provenance, history and the lifecycle actions. Every action writes
 * only this scenario document.
 */
export default function WhatIfScenarioScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid, baseline, threshold, today, displayCurrency, hasAccounts, loading: baseLoading, error: baseError, retry: baseRetry } = useWhatIfBaseline();
  const { scenarios, loading: listLoading, error: listError, retry: listRetry } = useWhatIfScenarios();
  const fmt = (n: number) => formatAmount(n, displayCurrency);
  const scenario = scenarios.find((s) => s.id === id) ?? null;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stamped = useRef(false);

  const ready = !baseLoading && !listLoading && !!scenario;
  const run = useMemo(() => (ready && hasAccounts ? runWhatIf({ scenario: scenario!, baseline, threshold }) : null), [ready, hasAccounts, scenario, baseline, threshold]);
  const status = useMemo(() => (scenario ? whatIfRecalculationStatus(scenario, baseline.reference) : null), [scenario, baseline.reference]);
  const groups = useMemo(() => (scenario ? whatIfChangeGroups(scenario) : []), [scenario]);

  // Stamp "last calculated" at most once per day per scenario. Metadata only.
  useEffect(() => {
    if (!run || !scenario || !uid || stamped.current || run.comparison.insufficientData) return;
    if (scenario.lastCalculated?.asOfDate === today) return;
    stamped.current = true;
    const mode = scenario.reference.asOfDate === today ? "saved" : "current";
    recordWhatIfScenarioCalculation(uid, scenario, { mode, asOfDate: today }).catch((e) => logError("whatIf.recordCalculation", e));
  }, [run, scenario, uid, today]);

  const act = async (fn: () => Promise<WriteOutcome | { outcome: WriteOutcome } | null>, message: string, after?: (r: unknown) => void) => {
    if (!uid) return;
    setBusy(true);
    try {
      const r = await fn();
      const outcome = r && typeof r === "object" && "outcome" in r ? r.outcome : (r as WriteOutcome | null);
      if (outcome) toast.success(writeSavedMessage(outcome, message));
      after?.(r);
    } catch (e) {
      logError("whatIf.action", e);
      toast.error(friendlyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () => {
    if (!scenario || !uid) return;
    appDialog.actionMenu(scenario.name, [
      { text: "Rename", onPress: () => setRenaming(scenario.name) },
      {
        text: "Duplicate",
        onPress: () =>
          void act(() => duplicateWhatIfScenario(uid, scenario, `${scenario.name} (copy)`.slice(0, WHAT_IF_SCENARIO_NAME_MAX)), "Copy saved", (r) => {
            const created = r as { id: string } | null;
            if (created?.id) router.replace(`/what-if/${encodeURIComponent(created.id)}` as Href);
          }),
      },
      {
        text: scenario.archived ? "Restore" : "Archive",
        onPress: () => void act(() => setWhatIfScenarioArchived(uid, scenario, !scenario.archived), scenario.archived ? "Scenario restored" : "Scenario archived"),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          appDialog.alert(`Delete "${scenario.name}"?`, "Only this scenario is deleted. Your transactions, accounts and goals stay exactly as they are.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => void act(() => deleteWhatIfScenario(uid, scenario.id), "Scenario deleted", () => router.replace("/what-if" as Href)),
            },
          ]),
      },
    ]);
  };

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
  };

  const error = baseError ?? listError;
  let body;
  if (error) {
    body = <ErrorState title="Couldn't open this scenario" description={error.message} onRetry={error.retryable ? () => { baseRetry(); listRetry(); } : undefined} />;
  } else if (baseLoading || listLoading) {
    body = <LoadingState variant="list" count={5} />;
  } else if (!scenario) {
    body = <ErrorState title="Scenario not found" description="It may have been deleted on another device." onRetry={() => router.replace("/what-if" as Href)} />;
  } else {
    const changedSources = status?.changedSources.map((s) => SOURCE_LABELS[s] ?? s) ?? [];
    const calc = scenario.lastCalculated;
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }}>
        <View style={card}>
          <Text style={h2} numberOfLines={2}>{scenario.name}</Text>
          <Text style={muted}>
            {`Saved with data from ${dateLabel(scenario.reference.asOfDate)} · version ${scenario.version}${scenario.archived ? " · archived" : ""}`}
          </Text>
          <Text style={muted}>
            {calc ? `Last calculated ${timeLabel(calc.atMs)} with data from ${dateLabel(calc.asOfDate)} (engine v${calc.engineVersion})` : "Not calculated yet"}
          </Text>
          {status && !status.upToDate ? (
            <View style={[styles.notice, { backgroundColor: surfaces.tile, borderRadius: theme.radius.sm }]} accessibilityLiveRegion="polite">
              <Text style={text}>
                {changedSources.length
                  ? `Your ${changedSources.join(", ")} changed since you saved this. The results below already use today's data.`
                  : "This scenario was saved with an older version of What If. The results below use today's data."}
              </Text>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onPress={() => void act(() => rebaseWhatIfScenario(uid!, scenario, baseline.reference), "Scenario updated to today")}
                accessibilityLabel="Update this scenario to today's data"
              >
                <View style={styles.rowStart}>
                  <RefreshCw size={16} color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }}>Update to today</Text>
                </View>
              </Button>
            </View>
          ) : null}
          <Button
            variant="outline"
            onPress={() => router.push(`/what-if/edit?id=${encodeURIComponent(scenario.id)}` as Href)}
            accessibilityLabel="Edit scenario"
          >
            <View style={styles.rowStart}>
              <Pencil size={16} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }}>Edit scenario</Text>
            </View>
          </Button>
        </View>

        {!hasAccounts ? (
          <View style={[card, { backgroundColor: surfaces.tile }]}>
            <Text style={text}>Add a bank, cash or wallet account so What If has a starting balance.</Text>
          </View>
        ) : run ? (
          <WhatIfResults run={run} fmt={fmt} />
        ) : null}

        <View style={card}>
          <Text style={h2} accessibilityRole="header">Changes and assumptions</Text>
          {groups.map((g) => (
            <View key={g.id} style={{ gap: 2 }}>
              <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{g.label}</Text>
              <Text style={muted}>{g.type ? WHAT_IF_CHANGE_INFO[g.type].title : "Change"}</Text>
              {g.assumptions.map((a) => (
                <Text key={a.code} style={muted}>
                  {`${a.label.split(": ").pop()}: ${typeof a.value === "number" && a.code.endsWith(":emi") ? fmt(a.value) : a.value} · ${a.provenance.kind === "derived" ? "worked out" : "your assumption"}`}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {scenario.history.length ? (
          <View style={card}>
            <Text style={h2} accessibilityRole="header">History</Text>
            {[...scenario.history].reverse().slice(0, 8).map((h) => (
              <Text key={`${h.version}-${h.atMs}-${h.action}`} style={muted}>
                {`v${h.version} · ${HISTORY_LABELS[h.action]}${h.fields.length ? ` (${h.fields.join(", ")})` : ""} · ${timeLabel(h.atMs)}`}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title={scenario?.name ?? "Scenario"}
        subtitle="What If"
        icon={<FlaskConical size={20} color={theme.colors.primary} />}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/what-if" as Href))}
        rightElement={
          scenario ? (
            <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Scenario actions" hitSlop={8} style={{ padding: theme.space.sm }}>
              <MoreVertical size={20} color={theme.colors.foreground} />
            </Pressable>
          ) : undefined
        }
      />
      {body}
      <Modal isOpen={renaming !== null} onClose={() => setRenaming(null)} title="Rename scenario" density="compact">
        <View style={{ gap: theme.space.md }}>
          <Input label="Scenario name" value={renaming ?? ""} onChangeText={setRenaming} maxLength={WHAT_IF_SCENARIO_NAME_MAX} />
          <Button
            disabled={!renaming?.trim() || busy}
            onPress={() => {
              const name = renaming?.trim();
              setRenaming(null);
              if (name && scenario && uid) void act(() => renameWhatIfScenario(uid, scenario, name), "Scenario renamed");
            }}
          >
            Save
          </Button>
        </View>
      </Modal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  rowStart: { flexDirection: "row", alignItems: "center", gap: 6 },
  notice: { padding: 12, gap: 8 },
});
