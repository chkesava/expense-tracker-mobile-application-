import { ScrollView } from "react-native";

import { Chip } from "@/components/ui/Chip";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The financial-year picker (SPENDLY-290). Years are always named through
 * `taxYearLabel`, so FY/AY and "Tax year" wording never mix (SPENDLY-289).
 * Scrolls sideways on narrow screens.
 */
export function TaxYearChips({
  years,
  value,
  onChange,
}: {
  years: readonly FinancialYearKey[];
  value: FinancialYearKey;
  onChange: (fy: FinancialYearKey) => void;
}) {
  const { theme } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg }}
      accessibilityRole="radiogroup"
      accessibilityLabel="Financial year"
    >
      {years.map((fy) => (
        <Chip
          key={fy}
          label={taxYearLabel(fy, "short")}
          selected={fy === value}
          onPress={() => onChange(fy)}
          appearance="outline"
          accessibilityRole="radio"
          accessibilityLabel={taxYearLabel(fy)}
        />
      ))}
    </ScrollView>
  );
}
