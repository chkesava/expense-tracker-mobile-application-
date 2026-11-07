import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Calculator, ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { AGE_BAND_LABELS, RESIDENTIAL_STATUS_LABELS, TaxProfileSheet } from "@/components/tax/TaxProfileSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxEstimate } from "@/hooks/useTaxEstimate";
import { useTaxRecordActions } from "@/hooks/useTaxRecordActions";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { taxRulesFor } from "@/shared/features/tax/data/taxRules";
import type { TaxRegime } from "@/shared/features/tax/data/taxRules/types";
import type { TaxComputation } from "@/shared/features/tax/utils/computeTax";
import {
  assumptionText,
  comparisonSentence,
  ESTIMATE_DISCLAIMER,
  ESTIMATE_LABEL,
  estimateStatusLabel,
  gapText,
  type GapFix,
} from "@/shared/features/tax/utils/estimatePresentation";
import { isFinancialYearKey, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { todayDateKey } from "@/shared/utils/dates";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const REGIME_TITLES: Record<TaxRegime, string> = { new: "New regime", old: "Old regime" };

/**
 * Informational tax estimate for one year, both regimes (SPENDLY-295).
 *
 * Shows the estimated tax, tax already paid and the balance or refund for
 * each regime; the workings step by step with their basis; what Spendly
 * assumed; and what stops or limits the estimate, with where to fix it. No
 * figure is shown when Spendly can't estimate the case or a counted figure is
 * unknown. Every output names the rule version it used.
 */
export default function TaxEstimateScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { fy: param } = useLocalSearchParams<{ fy: string }>();
  const fy = typeof param === "string" && isFinancialYearKey(param) ? param : "";
  const { enabled, loading: flagLoading } = useTaxCenterFlag();
  const { settings } = useSettings();
  const todayKey = todayDateKey(settings?.timezone);
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isOnline } = useNetwork();
  const on = enabled && !!fy;
  const { comparison, profile, loading, error, retry } = useTaxEstimate(fy, { enabled: on });
  const actions = useTaxRecordActions(fy, todayKey);
  const [profileOpen, setProfileOpen] = useState(false);
  const [regime, setRegime] = useState<TaxRegime | null>(null);

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const shown: TaxRegime = regime ?? (profile?.regimeNote === "old" ? "old" : "new");
  const rules = taxRulesFor(fy);
  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const heading = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };

  const fixGap = (fix: GapFix) => {
    if (fix === "profile") setProfileOpen(true);
    else if (fix) router.push(`/tax/${fy}/${fix}` as Href);
  };

  const header = (
    <PageHeader title="Tax estimate" subtitle={taxYearLabel(fy)} icon={<Calculator size={20} color={theme.colors.primary} />} onBack={() => router.back()} />
  );

  if (error) {
    return (
      <PageShell>
        {header}
        <ErrorState title="Couldn't load your tax figures" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageShell>
    );
  }
  if (loading) {
    return (
      <PageShell scrollable={false}>
        {header}
        <LoadingState variant="list" count={4} label="Working out your estimate…" />
      </PageShell>
    );
  }

  const selected = comparison[shown];
  const gaps = [
    ...selected.unsupported.map((code) => ({ code, tone: "muted" as const })),
    ...selected.missing.map((code) => ({ code, tone: "warning" as const })),
    ...selected.pending.map((code) => ({ code, tone: "warning" as const })),
  ];
  const sentence = comparisonSentence(comparison, money);

  return (
    <PageShell>
      {header}
      <View style={{ gap: theme.space.lg, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.xl }}>
        {!isOnline ? <TaxNotice tone="offline">You're offline. Showing what's saved on this device.</TaxNotice> : null}
        <TaxNotice>{ESTIMATE_DISCLAIMER}</TaxNotice>

        <Pressable
          onPress={() => setProfileOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Change your residential status and age band"
          style={({ pressed }) => [styles.row, { gap: theme.space.md, paddingVertical: theme.space.sm, opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={muted}>Estimated for</Text>
            <Text style={text}>
              {RESIDENTIAL_STATUS_LABELS[profile?.residentialStatus ?? "unknown"]} · {AGE_BAND_LABELS[profile?.ageBand ?? "unknown"]}
            </Text>
          </View>
          <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>Change</Text>
        </Pressable>

        <View style={[styles.row, { gap: theme.space.md, alignItems: "stretch" }]}>
          {(["new", "old"] as const).map((r) => (
            <RegimeCard key={r} title={REGIME_TITLES[r]} computation={comparison[r]} selected={shown === r} currency={currency} onPress={() => setRegime(r)} />
          ))}
        </View>
        {sentence ? <Text style={muted}>{sentence}</Text> : null}

        {gaps.length > 0 ? (
          <View style={{ gap: theme.space.sm }}>
            <Text accessibilityRole="header" style={heading}>
              {selected.liability === null ? "Why there's no estimate" : "To check"}
            </Text>
            {gaps.map(({ code, tone }) => {
              const g = gapText(code);
              return (
                <Pressable
                  key={code}
                  disabled={!g.fix}
                  onPress={() => fixGap(g.fix)}
                  accessibilityRole={g.fix ? "button" : "text"}
                  style={[styles.row, { gap: theme.space.sm, paddingVertical: theme.space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }]}
                >
                  <Text style={[text, { flex: 1, color: tone === "warning" ? theme.colors.foreground : theme.colors.mutedForeground }]}>{g.text}</Text>
                  {g.fix ? <ChevronRight size={16} color={theme.colors.mutedForeground} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: theme.space.sm }}>
          <Text accessibilityRole="header" style={heading}>
            How it's worked out
          </Text>
          <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="tablist">
            {(["new", "old"] as const).map((r) => (
              <Chip key={r} label={REGIME_TITLES[r]} selected={shown === r} onPress={() => setRegime(r)} size="sm" accessibilityRole="tab" />
            ))}
          </View>
          {selected.steps.length === 0 ? (
            <Text style={muted}>No workings: there's no estimate for this regime yet.</Text>
          ) : (
            selected.steps.map((s) => (
              <View key={s.key} style={[styles.row, { gap: theme.space.md, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={text}>{s.label}</Text>
                  {s.basis ? <Text style={muted}>{s.basis}</Text> : null}
                </View>
                <Amount value={s.amount} currency={currency} ghostable style={{ ...text, fontFamily: theme.fontFamily.semibold }} />
              </View>
            ))
          )}
        </View>

        {selected.assumptions.length > 0 ? (
          <View style={{ gap: theme.space.xs }}>
            <Text accessibilityRole="header" style={heading}>
              What Spendly assumed
            </Text>
            {selected.assumptions.map((a) => (
              <Text key={a} style={muted}>
                • {assumptionText(a)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ gap: theme.space.xs }}>
          <Text style={muted}>Rules: {comparison.ruleVersion ?? "not available for this year"}</Text>
          {rules?.sources.map((source) => (
            <Text key={source.url} style={[muted, { color: theme.colors.primary }]} accessibilityRole="link" onPress={() => void Linking.openURL(source.url)}>
              {source.label} (checked {source.checked})
            </Text>
          ))}
        </View>
        <Button variant="ghost" size="sm" onPress={() => router.push(`/tax/${fy}/income` as Href)}>
          Review your income
        </Button>
      </View>

      <TaxProfileSheet
        open={profileOpen}
        fy={fy}
        profile={profile}
        saving={actions.saving}
        onSave={(values) => actions.saveProfile(profile, values)}
        onClose={() => setProfileOpen(false)}
      />
    </PageShell>
  );
}

function RegimeCard({
  title,
  computation,
  selected,
  currency,
  onPress,
}: {
  title: string;
  computation: TaxComputation;
  selected: boolean;
  currency: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const status = estimateStatusLabel(computation);
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const big = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.lg };
  const balance = computation.balance;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${status.label}`}
      style={[
        styles.card,
        {
          padding: theme.space.md,
          gap: 4,
          borderRadius: theme.radius.lg,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: theme.colors.card,
        },
      ]}
    >
      <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{title}</Text>
      <Text style={muted}>Estimated tax</Text>
      {computation.liability === null ? (
        <Text style={[big, { color: theme.colors.mutedForeground }]}>—</Text>
      ) : (
        <Amount value={computation.liability} currency={currency} ghostable style={big} />
      )}
      {balance !== null ? (
        <>
          <Text style={muted}>{balance >= 0 ? "Still to pay" : "Refund"}</Text>
          <Amount value={Math.abs(balance)} currency={currency} ghostable style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }} />
        </>
      ) : null}
      <Text
        style={{
          color: status.tone === "success" ? theme.colors.success : status.tone === "warning" ? theme.colors.warning : theme.colors.mutedForeground,
          fontFamily: theme.fontFamily.medium,
          fontSize: theme.typography.xs,
        }}
      >
        {computation.status === "ok" ? ESTIMATE_LABEL : status.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  card: { flex: 1, borderWidth: 1 },
});
