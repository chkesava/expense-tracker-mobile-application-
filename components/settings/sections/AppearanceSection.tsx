import { Text, View } from "react-native";

import { FieldLabel, SettingsPanel } from "@/components/settings/SettingsControls";
import { ExpensePalettePicker } from "@/components/settings/ExpensePalettePicker";
import { PersonalizationPreviewCard } from "@/components/settings/PersonalizationPreviewCard";
import {
  DashboardWidgetOrder,
  DashboardWidgetToggles,
} from "@/components/settings/SettingsSubmenus";
import { useTranslation } from "@/providers/LocalizationProvider";
import { useTheme } from "@/theme/ThemeProvider";


/**
 * SPENDLY-604: the Expense app is always dark, so there is no theme mode or
 * accent to pick here. SPENDLY-618: the user picks one of the dark Expense
 * palettes instead, stored as `expensePalette`; the saved theme fields are
 * left as they are, since Ganesh Seva and Nutrition still read them.
 */
export function AppearanceSection() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={{ gap: 16 }}>
      <SettingsPanel
        title={t("section_personalize", "Personalize")}
        subtitle="Colour palette & live preview"
      >
        <FieldLabel label={t("section_preview", "Live Theme Preview")} />
        <PersonalizationPreviewCard />

        <FieldLabel label={t("theme_palette", "Colour palette")} />
        <ExpensePalettePicker />
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: theme.colors.mutedForeground,
            fontFamily: theme.fontFamily.regular,
          }}
        >
          Every palette is dark. Green and red always mean money in and money out.
        </Text>
      </SettingsPanel>

      <DashboardWidgetToggles />
      <DashboardWidgetOrder />
    </View>
  );
}
