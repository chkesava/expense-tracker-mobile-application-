import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Hourglass, Info, SlidersHorizontal, TrendingDown } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { DataRow, HeroSection, MetaLabel, Pill, Section, SectionAction, type Tone } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { RunwaySettingsSheet } from "@/components/runway/RunwaySettingsSheet";
import { RunwayTimeline } from "@/components/runway/RunwayTimeline";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WhatIfEntryRow } from "@/components/whatIf/WhatIfEntryRow";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useRunway } from "@/hooks/useRunway";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { saveRunwaySettings } from "@/services/runway/runwaySettingsStore";
import { RUNWAY_MODE_INFO } from "@/shared/data/runwayRules";
import type { RunwayMode } from "@/shared/types/runway";
import type { RunwaySettings } from "@/shared/utils/runwaySettings";
import { CONFIDENCE_LABELS, dateLabel, methodologyLines, runwayHeadline, timelineRows } from "@/shared/utils/runwayView";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Financial Runway (SPENDLY-210): how long counted money lasts under the
 * user's assumptions. Always labelled as an estimate; the methodology is one
 * tap away; nothing here writes to any financial record.
 */
export default function RunwayScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();
  const { uid, model, sources, settings, displayCurrency, loading, error, retry } = useRunway();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  // SPENDLY-545: ghost-aware. Every runway figure, the reserve in the
  // headline and the timeline labels used to show in ghost mode.
  const fmt = useGhostMoney(displayCurrency);

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
  const rows = useMemo(() => timelineRows(model.baseline, out, fmt), [model.baseline, out, fmt]);
  const method = useMemo(() => methodologyLines(settings.mode, model.baseline, model.assumptions), [settings.mode, model.baseline, model.assumptions]);

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const figure = (value: string) => (
    <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, fontVariant: ["tabular-nums"] }}>
      {value}
    </Text>
  );
  const badgeTone: Tone = headline.tone === "warning" ? "negative" : headline.tone === "muted" ? "muted" : "accent";

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
    body = (
      <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
        <DashboardSkeleton variant="hero" />
        <DashboardSkeleton variant="section" rows={4} />
      </View>
    );
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

        <HeroSection
          variant="deep"
          title="Runway"
          subtitle={CONFIDENCE_LABELS[model.confidence]}
          icon={<Hourglass size={16} color={theme.colors.primary} />}
          action={<Pill label={headline.badge} tone={badgeTone} />}
        >
          <View
            style={{ gap: 6 }}
            accessible
            accessibilityLabel={`${headline.badge}. ${headline.title}. ${headline.detail}. ${RUNWAY_MODE_INFO[settings.mode].label}. ${CONFIDENCE_LABELS[model.confidence]}.`}
          >
            <Text
              style={{
                color: headline.tone === "warning" ? theme.colors.destructive : theme.colors.foreground,
                fontFamily: theme.fontFamily.bold,
                fontSize: theme.typography.xxl,
              }}
            >
              {headline.title}
            </Text>
            <Text style={[text, { color: theme.colors.mutedForeground }]}>{headline.detail}</Text>
            <MetaLabel numberOfLines={2}>{RUNWAY_MODE_INFO[settings.mode].label}</MetaLabel>
          </View>
        </HeroSection>

        {r.state === "insufficient_data" ? (
          <EmptyState
            illustration="expenses"
            title="Record a full month to get an estimate"
            description="Runway uses your typical monthly spending. Keep adding expenses and income; once a whole month is recorded, the estimate appears here."
          />
        ) : (
          <>
            <Section title="What it's based on">
              <DataRow
                divider
                title="Counted money today"
                meta="Actual · opens runway sources"
                value={figure(fmt(out.liquid))}
                valueMeta={<ChevronRight size={14} color={theme.colors.mutedForeground} />}
                onPress={() => router.push("/runway/sources" as Href)}
                accessibilityLabel={`Counted money ${fmt(out.liquid)}. Opens runway sources.`}
              />
              <Figure label="Monthly burn" value={r.monthlyBurn === null ? "—" : fmt(r.monthlyBurn)} />
              {settings.mode !== "gross_burn" ? <Figure label="Expected money in" meta={`Next ${settings.projectionMonths} months`} value={fmt(out.expectedInflow)} /> : null}
              <Figure label="Expected money out" meta={`Next ${settings.projectionMonths} months`} value={fmt(out.expectedOutflow)} />
              {out.minimumBalance ? <Figure label="Lowest projected balance" value={fmt(out.minimumBalance.amount)} meta={`On ${dateLabel(out.minimumBalance.date)}`} /> : null}
              <Figure label="Reserve" value={r.floor > 0 ? fmt(r.floor) : "None set"} last />
            </Section>

            <Section title="Month by month" subtitle="Actual months come from your records. Projected months are estimates.">
              <RunwayTimeline rows={rows} format={fmt} />
            </Section>

            {out.drivers.length ? (
              <Section title="Biggest drivers" icon={<TrendingDown size={16} color={theme.colors.mutedForeground} />}>
                {out.drivers.map((d, i) => (
                  <DataRow
                    key={d.id}
                    divider={i < out.drivers.length - 1}
                    title={d.label}
                    meta={`Money ${d.direction === "in" ? "in" : "out"} · ${Math.round(d.share * 100)}%`}
                    value={figure(fmt(d.amount))}
                    accessibilityLabel={`${d.label}, money ${d.direction === "in" ? "in" : "out"}, ${fmt(d.amount)}`}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}

        {model.baseline.unusual.length ? (
          <Section title="Unusual one-offs" subtitle={settings.includeUnusual ? "Included in typical spending." : "Left out of typical spending. Change this in settings."}>
            {model.baseline.unusual.slice(0, 5).map((u, i, list) => (
              <DataRow key={u.id || u.date + u.amount} divider={i < list.length - 1} title={u.label} meta={dateLabel(u.date)} value={figure(fmt(u.amount))} />
            ))}
          </Section>
        ) : null}

        <WhatIfEntryRow subtitle="See how a raise, a purchase or a new EMI would change your runway" />

        <Section
          title="How this is worked out"
          icon={<Info size={16} color={theme.colors.primary} />}
          action={
            <SectionAction
              label={showMethod ? "Hide" : "Show"}
              onPress={() => setShowMethod((v) => !v)}
              accessibilityLabel={`${showMethod ? "Hide" : "Show"} how this is worked out`}
            />
          }
        >
          {showMethod ? (
            <View style={{ gap: 4 }}>
              {method.map((line, i) => (
                <Text key={i} style={muted}>{`• ${line}`}</Text>
              ))}
            </View>
          ) : null}
        </Section>
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

function Figure({ label, value, meta, last = false }: { label: string; value: string; meta?: string; last?: boolean }) {
  const { theme } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${meta ? `, ${meta.toLowerCase()}` : ""}`}>
      <DataRow
        divider={!last}
        title={label}
        meta={meta}
        value={
          <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, fontVariant: ["tabular-nums"] }}>
            {value}
          </Text>
        }
      />
    </View>
  );
}
