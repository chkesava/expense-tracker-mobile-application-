import { Text, View } from "react-native";

import { FieldLabel, SettingsPanel } from "@/components/settings/SettingsControls";
import { PersonalizationPreviewCard } from "@/components/settings/PersonalizationPreviewCard";
import {
  DashboardWidgetOrder,
  DashboardWidgetToggles,
} from "@/components/settings/SettingsSubmenus";
import { useTranslation } from "@/providers/LocalizationProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { EXPENSE_THEME_NAME, THEME_LABELS } from "@/theme/tokens";

/**
 * SPENDLY-604: the Expense app is always dark (Midnight Emerald), so there is
 * no theme mode, preset or accent to pick here any more. The saved theme
 * fields on the user doc are left as they are; Ganesh Seva and Nutrition
 * still read them.
 */
export function AppearanceSection() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={{ gap: 16 }}>
      <SettingsPanel
        title={t("section_personalize", "Personalize")}
        subtitle="Dark theme & live preview"
      >
        <FieldLabel label={t("section_preview", "Live Theme Preview")} />
        <PersonalizationPreviewCard />

        <FieldLabel label={t("theme_mode", "Theme")} />
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: theme.colors.mutedForeground,
            fontFamily: theme.fontFamily.regular,
          }}
        >
          Spendly always uses the {THEME_LABELS[EXPENSE_THEME_NAME]} dark theme, so every screen matches the dashboard.
        </Text>
      </SettingsPanel>

      <DashboardWidgetToggles />
      <DashboardWidgetOrder />
    </View>
  );
}
