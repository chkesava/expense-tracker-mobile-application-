import { StyleSheet, View } from "react-native";
import { AlertTriangle, Wallet } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import {
  HeroSection,
  MetaLabel,
  StatTile,
  StatusStrip,
} from "@/components/dashboard/primitives";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The Borrowings section's summary (SPENDLY-536): what is still owed, then
 * borrowed / interest / repaid, and an overdue warning in words. Built on the
 * dashboard's deep hero instead of a fixed green gradient. Same props.
 */
export function BorrowingSummaryCard({
  totalBorrowed,
  totalOutstanding,
  totalInterest,
  totalRepaid,
  overdueCount,
  currency,
}: {
  totalBorrowed: number;
  totalOutstanding: number;
  totalInterest: number;
  totalRepaid: number;
  overdueCount: number;
  currency: string;
}) {
  const { theme } = useTheme();

  return (
    <HeroSection
      variant="deep"
      title="Borrowings"
      subtitle="Still owed, principal plus interest"
      icon={<Wallet size={16} color={theme.colors.primary} strokeWidth={2.3} />}
    >
      <MetaLabel>Outstanding</MetaLabel>
      <FinancialAmount
        value={totalOutstanding}
        currency={currency}
        size="hero"
        weight="bold"
        tone={overdueCount > 0 ? "negative" : "default"}
      />

      <View style={styles.tiles}>
        <StatTile label="Borrowed" style={styles.tile}>
          <FinancialAmount value={totalBorrowed} currency={currency} size="sm" weight="bold" />
        </StatTile>
        <StatTile label="Interest" style={styles.tile}>
          <FinancialAmount value={totalInterest} currency={currency} size="sm" weight="bold" />
        </StatTile>
        <StatTile label="Repaid" style={styles.tile}>
          <FinancialAmount value={totalRepaid} currency={currency} size="sm" weight="bold" tone="positive" />
        </StatTile>
      </View>

      {overdueCount > 0 ? (
        <View style={styles.strip}>
          <StatusStrip
            tone="negative"
            icon={<AlertTriangle size={14} color={theme.colors.destructive} strokeWidth={2.4} />}
            message={`${overdueCount} borrowing${overdueCount === 1 ? "" : "s"} past the due date`}
          />
        </View>
      ) : null}
    </HeroSection>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 90,
  },
  strip: {
    marginTop: 12,
  },
});
