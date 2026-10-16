import { StyleSheet, View } from "react-native";
import { CreditCard } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator, type ProgressStatus } from "@/components/dashboard/ProgressIndicator";
import { HeroSection, Pill, StatTile } from "@/components/dashboard/primitives";
import { creditUtilizationBand } from "@/shared/utils/creditCardPresentation";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The Cards section's summary (SPENDLY-535): unbilled spend this cycle across
 * every card, how much of the combined limit it uses, and what is left. Built
 * on the dashboard's deep hero; the status is spelled out, not only coloured.
 * Same props and figures as before.
 */
export function CreditSummaryCard({
  totalUsed,
  totalLimit,
  totalAvailable,
  utilizationRate,
  currency,
}: {
  totalUsed: number;
  totalLimit: number;
  totalAvailable: number;
  utilizationRate: number;
  currency: string;
}) {
  const { theme } = useTheme();
  const utilizationPercent = Math.round(utilizationRate);
  const band = creditUtilizationBand(utilizationRate);
  const status: ProgressStatus = band.level === "high" ? "over" : band.level === "moderate" ? "watch" : "good";

  return (
    <HeroSection
      variant="deep"
      title="Unbilled this cycle"
      subtitle="Across all your cards"
      icon={<CreditCard size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      action={<Pill label={`${utilizationPercent}% used`} tone={band.tone} />}
    >
      <FinancialAmount value={totalUsed} currency={currency} size="hero" weight="bold" />

      <ProgressIndicator
        pct={utilizationRate}
        status={status}
        statusLabel={`${band.word} utilisation`}
        trailing={totalLimit > 0 ? `${utilizationPercent}% of limit` : "No limit set"}
        height={8}
        accessibilityLabel="Credit utilisation"
        style={styles.meter}
      />

      <View style={styles.tiles}>
        <StatTile label="Total limit">
          <FinancialAmount value={totalLimit} currency={currency} size="md" weight="bold" />
        </StatTile>
        <StatTile label="Available credit">
          <FinancialAmount value={totalAvailable} currency={currency} size="md" weight="bold" tone="positive" />
        </StatTile>
      </View>
    </HeroSection>
  );
}

const styles = StyleSheet.create({
  meter: {
    marginTop: 12,
  },
  tiles: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
});
