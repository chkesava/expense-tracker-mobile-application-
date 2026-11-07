import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, FolderLock, IndianRupee, Landmark, PiggyBank, Scale } from "lucide-react-native";
import type { ReactNode } from "react";

import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { TaxYearChips } from "@/components/tax/TaxYearChips";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useSettings } from "@/providers/SettingsProvider";
import { defaultTaxYear, selectableTaxYears, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { todayDateKey } from "@/shared/utils/dates";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Tax & ITR Readiness Center (epic SPENDLY-288): pick a financial year, then
 * open a section. SPENDLY-290 brings the Income section; the readiness
 * dashboard (SPENDLY-296) grows here. Reads nothing itself (SPENDLY-406).
 */
export default function TaxCenterScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { enabled, loading: flagLoading } = useTaxCenterFlag();
  const { settings } = useSettings();
  const params = useLocalSearchParams<{ fy?: string }>();
  const todayKey = todayDateKey(settings?.timezone);
  const years = useMemo(() => selectableTaxYears(todayKey), [todayKey]);
  const [fy, setFy] = useState(() =>
    params.fy && years.includes(params.fy) ? params.fy : defaultTaxYear(todayKey)
  );

  // Wait for system_settings before acting on "off", so a deep link isn't
  // redirected by the default (flag off) before the first snapshot.
  if (!enabled) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/insights" as Href} />;
  }

  return (
    <PageShell>
      <PageHeader
        title="Tax & ITR readiness"
        subtitle={taxYearLabel(fy)}
        icon={<Landmark size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
      />
      <View style={{ gap: theme.space.lg, paddingBottom: theme.space.xl }}>
        <TaxYearChips years={years} value={fy} onChange={setFy} />
        <View style={{ paddingHorizontal: theme.space.lg, gap: theme.space.lg }}>
          <TaxNotice>
            Spendly helps you get your records ready. It doesn't file your return or give tax advice. Check every
            figure against your Form 16, AIS and certificates before you file.
          </TaxNotice>

          <SectionRow
            title="Income"
            subtitle="Interest, dividends, rent and income you add, by head of income"
            icon={<IndianRupee size={20} color={theme.colors.primary} />}
            accessibilityLabel={`Income for ${taxYearLabel(fy)}`}
            onPress={() => router.push(`/tax/${fy}/income` as Href)}
          />
          <SectionRow
            title="TDS & Form 16"
            subtitle="Form 16, TDS certificates and your AIS or 26AS, compared"
            icon={<Scale size={20} color={theme.colors.primary} />}
            accessibilityLabel={`TDS and Form 16 for ${taxYearLabel(fy)}`}
            onPress={() => router.push(`/tax/${fy}/tds` as Href)}
          />
          <SectionRow
            title="Deductions"
            subtitle="Tax-saving investments, insurance, loans, rent and donations"
            icon={<PiggyBank size={20} color={theme.colors.primary} />}
            accessibilityLabel={`Deductions for ${taxYearLabel(fy)}`}
            onPress={() => router.push(`/tax/${fy}/deductions` as Href)}
          />
          <SectionRow
            title="Documents"
            subtitle="Form 16, AIS, 26AS, proofs and receipts, kept privately"
            icon={<FolderLock size={20} color={theme.colors.primary} />}
            accessibilityLabel={`Documents for ${taxYearLabel(fy)}`}
            onPress={() => router.push(`/tax/${fy}/documents` as Href)}
          />
        </View>
      </View>
    </PageShell>
  );
}

/** One section of the tax center: icon, what it holds, and where it goes. */
function SectionRow({
  title,
  subtitle,
  icon,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.space.md,
          padding: theme.space.lg,
          borderRadius: theme.radius.lg,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? surfaces.tile : theme.colors.card,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>{title}</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
