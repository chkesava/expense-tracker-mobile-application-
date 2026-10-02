import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Hourglass, Info, SlidersHorizontal } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { RunwaySettingsSheet } from "@/components/runway/RunwaySettingsSheet";
import { RunwayTimeline } from "@/components/runway/RunwayTimeline";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useRunway } from "@/hooks/useRunway";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { saveRunwaySettings } from "@/services/runway/runwaySettingsStore";
import { RUNWAY_MODE_INFO } from "@/shared/data/runwayRules";
import type { RunwayMode } from "@/shared/types/runway";
import { formatAmount } from "@/shared/utils/formatCurrency";
import type { RunwaySettings } from "@/shared/utils/runwaySettings";
import { CONFIDENCE_LABELS, dateLabel, methodologyLines, runwayHeadline, timelineRows } from "@/shared/utils/runwayView";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Financial Runway (SPENDLY-210): how long counted money lasts under the
 * user's assumptions. Always labelled as an estimate; the methodology is one
 * tap away; nothing here writes to any financial record.
 */
export default function RunwayScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();
  const { uid, model, sources, settings, displayCurrency, loading, error, retry } = useRunway();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const fmt = (n: number) => formatAmount(n, displayCurrency);

  const persist = async (next: RunwaySettings, message: string) => {
    if (!uid) return;
    setSaving(true);
    try {
      const outcome = await saveRunwaySettings(uid, next);
      if (outcome) toast.success(writeSavedMessage(outcome, message));
      setSettingsOpen(false);
    } catch (e) {
      logError("runway.settings", e);
      toast.error(friendlyErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const out = model.output;
  const reserveText =
    out.result.floor > 0 ? (settings.thresholdKind === "essential_months" ? `${settings.thresholdMonths}-month (${fmt(out.result.floor)})` : fmt(out.result.floor)) : "";
  const headline = runwayHeadline(out, settings.projectionMonths, reserveText);
  const rows = useMemo(() => timelineRows(model.baseline, out, fmt), [model.baseline, out, displayCurrency]); // eslint-disable-line react-hooks/exhaustive-deps
  const method = useMemo(() => methodologyLines(settings.mode, model.baseline, model.assumptions), [settings.mode, model.baseline, model.assumptions]);

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, gap: theme.space.sm };

  const header = (
    <PageHeader
      title="Financial runway"
      subtitle="A planning estimate"
      icon={<Hourglass size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/ledger" as Href))}
      rightElement={
        <Pressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Runway settings"
          hitSlop={8}
          style={{ padding: theme.space.sm }}
        >
          <SlidersHorizontal size={20} color={theme.colors.foreground} />
        </Pressable>
      }
    />
  );

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your runway" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading) {
    body = <LoadingState variant="list" count={5} />;
  } else if (sources.resources.length === 0) {
    body = (
      <EmptyState
        illustration="expenses"
        title="Add an account to see your runway"
        description="Runway starts from the money in your bank, cash and wallet accounts."
        primaryAction={{ label: "Go to accounts", onPress: () => router.replace("/ledger" as Href) }}
      />
    );
  } else {
    const r = out.result;
    body = (
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingBottom: bottomPadding, gap: theme.space.lg }}>
        <SegmentedControl<RunwayMode>
          options={[
            { value: "commitment_projection", label: "Projection" },
            { value: "net_burn", label: "Net burn" },
            { value: "gross_burn", label: "Essentials" },
          ]}
          value={settings.mode}
          onChange={(mode) => void persist({ ...settings, mode }, `Showing ${RUNWAY_MODE_INFO[mode].label.toLowerCase()}`)}
        />

        <View
          style={[card, { borderWidth: StyleSheet.hairlineWidth, backgroundColor: surfaces.tile }]}
          accessible
          accessibilityLabel={`${headline.badge}. ${headline.title}. ${headline.detail}. ${RUNWAY_MODE_INFO[settings.mode].label}. ${CONFIDENCE_LABELS[model.confidence]}.`}
        >
          <View style={styles.rowBetween}>
            <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>{headline.badge.toUpperCase()}</Text>
            <Text style={muted}>{CONFIDENCE_LABELS[model.confidence]}</Text>
          </View>
          <Text
            style={{
              color: headline.tone === "warning" ? theme.colors.destructive : theme.colors.foreground,
              fontFamily: theme.fontFamily.bold,
              fontSize: theme.typography.xxl,
            }}
          >
            {headline.title}
          </Text>
          <Text style={text}>{headline.detail}</Text>
          <Text style={muted}>{RUNWAY_MODE_INFO[settings.mode].label}</Text>
        </View>

        {r.state === "insufficient_data" ? (
          <EmptyState
            illustration="expenses"
            title="Record a full month to get an estimate"
            description="Runway uses your typical monthly spending. Keep adding expenses and income; once a whole month is recorded, the estimate appears here."
          />
        ) : (
          <>
            <View style={[card, { borderWidth: StyleSheet.hairlineWidth }]}>
              <Pressable
                onPress={() => router.push("/runway/sources" as Href)}
                accessibilityRole="button"
                accessibilityLabel={`Counted money ${fmt(out.liquid)}. Opens runway sources.`}
                style={styles.rowBetween}
              >
                <View>
                  <Text style={muted}>Counted money today</Text>
                  <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{fmt(out.liquid)}</Text>
                </View>
                <ChevronRight size={16} color={theme.colors.mutedForeground} />
              </Pressable>
              <Figure label="Monthly burn" value={r.monthlyBurn === null ? "—" : fmt(r.monthlyBurn)} />
              {settings.mode !== "gross_burn" ? <Figure label={`Expected money in (${settings.projectionMonths} months)`} value={fmt(out.expectedInflow)} /> : null}
              <Figure label={`Expected money out (${settings.projectionMonths} months)`} value={fmt(out.expectedOutflow)} />
              {out.minimumBalance ? (
                <Figure label="Lowest projected balance" value={`${fmt(out.minimumBalance.amount)} on ${dateLabel(out.minimumBalance.date)}`} />
              ) : null}
              <Figure label="Reserve" value={r.floor > 0 ? fmt(r.floor) : "None set"} />
            </View>

            <View style={{ gap: theme.space.sm }}>
              <Text style={h2} accessibilityRole="header">
                Month by month
              </Text>
              <Text style={muted}>Actual months come from your records. Projected months are estimates.</Text>
              <RunwayTimeline rows={rows} format={fmt} />
            </View>

            {out.drivers.length ? (
              <View style={{ gap: theme.space.sm }}>
                <Text style={h2} accessibilityRole="header">
                  Biggest drivers
                </Text>
                {out.drivers.map((d) => (
                  <View key={d.id} style={styles.rowBetween} accessible accessibilityLabel={`${d.label}, money ${d.direction === "in" ? "in" : "out"}, ${fmt(d.amount)}`}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={text} numberOfLines={1}>
                        {d.label}
                      </Text>
                      <Text style={muted}>
                        Money {d.direction === "in" ? "in" : "out"} · {Math.round(d.share * 100)}%
                      </Text>
                    </View>
                    <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{fmt(d.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}

        {model.baseline.unusual.length ? (
          <View style={{ gap: theme.space.sm }}>
            <Text style={h2} accessibilityRole="header">
              Unusual one-offs
            </Text>
            <Text style={muted}>{settings.includeUnusual ? "Included in typical spending." : "Left out of typical spending. Change this in settings."}</Text>
            {model.baseline.unusual.slice(0, 5).map((u) => (
              <View key={u.id || u.date + u.amount} style={styles.rowBetween}>
                <Text style={[text, { flex: 1 }]} numberOfLines={1}>
                  {u.label} · {dateLabel(u.date)}
                </Text>
                <Text style={text}>{fmt(u.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[card, { borderWidth: StyleSheet.hairlineWidth }]}>
          <Pressable
            onPress={() => setShowMethod((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMethod }}
            style={[styles.rowBetween, { minHeight: 44 }]}
          >
            <View style={[styles.row, { gap: theme.space.sm }]}>
              <Info size={16} color={theme.colors.primary} />
              <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>How this is worked out</Text>
            </View>
            <Text style={muted}>{showMethod ? "Hide" : "Show"}</Text>
          </Pressable>
          {showMethod ? method.map((line, i) => <Text key={i} style={muted}>{`• ${line}`}</Text>) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      {header}
      {body}
      <RunwaySettingsSheet
        isOpen={settingsOpen}
        settings={settings}
        saving={saving}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => void persist(next, "Runway settings saved")}
      />
    </PageShell>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.rowBetween} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs, flex: 1 }}>{label}</Text>
      <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
