import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, IndianRupee, Landmark } from "lucide-react-native";

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
  const surfaces = useSurfaces();
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

          <Pressable
            onPress={() => router.push(`/tax/${fy}/income` as Href)}
            accessibilityRole="button"
            accessibilityLabel={`Income for ${taxYearLabel(fy)}`}
            accessibilityHint="Opens the income you have for this year"
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
            <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
              <IndianRupee size={20} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>Income</Text>
              <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                Interest, dividends, rent and income you add, by head of income
              </Text>
            </View>
            <ChevronRight size={18} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
