import { Pressable, Text, View } from "react-native";

import { ChipRow, FieldLabel, SettingsPanel } from "@/components/settings/SettingsControls";
import { PersonalizationPreviewCard } from "@/components/settings/PersonalizationPreviewCard";
import {
  DashboardWidgetOrder,
  DashboardWidgetToggles,
} from "@/components/settings/SettingsSubmenus";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@/providers/LocalizationProvider";
import { useTheme } from "@/theme/ThemeProvider";
import {
  ACCENT_COLOR_NAMES,
  ACCENT_PALETTES,
  THEME_LABELS,
  type AccentColorName,
  type ThemeMode,
  type ThemeName,
  themeUsesDarkPalette,
} from "@/theme/tokens";

const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark (OLED)" },
  { value: "custom", label: "Custom Presets" },
];

export function AppearanceSection() {
  const {
    theme,
    themeName,
    setThemeName,
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
  } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={{ gap: 16 }}>
      <SettingsPanel
        title={t("section_personalize", "Personalize")}
        subtitle="Theme, accent color & live preview"
      >
        <FieldLabel label={t("section_preview", "Live Theme Preview")} />
        <PersonalizationPreviewCard />

        <FieldLabel label={t("theme_mode", "Theme Mode")} />
        <ChipRow
          options={THEME_MODE_OPTIONS}
          selected={themeMode}
          onSelect={(v) => setThemeMode(v as ThemeMode)}
        />

        {themeMode === "custom" ? (
          <View style={{ gap: 8 }}>
            <FieldLabel label={t("theme_mode_custom", "Theme Presets")} />
            <ChipRow
              options={(["light", "dark"] as ThemeName[]).map((name) => ({
                value: name,
                label: THEME_LABELS[name],
              }))}
              selected={themeName}
              onSelect={(v) => setThemeName(v as ThemeName)}
            />
          </View>
        ) : null}

        <FieldLabel label={t("accent_color", "Accent Color")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {ACCENT_COLOR_NAMES.map((name) => {
            const pal = ACCENT_PALETTES[name];
            const active = accentColor === name;
            const palPrimary = themeUsesDarkPalette(themeName)
              ? pal.dark.primary
              : pal.light.primary;
            const palContainer = themeUsesDarkPalette(themeName)
              ? pal.dark.primaryContainer
              : pal.light.primaryContainer;

            return (
              <Pressable
                key={name}
                onPress={() => {
                  void haptic.selection();
                  setAccentColor(name as AccentColorName);
                }}
                android_ripple={{
                  color: palPrimary + "20",
                  borderless: false,
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 14,
                  minHeight: 40,
                  borderRadius: 20,
                  borderCurve: "continuous",
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? palPrimary : theme.colors.border,
                  backgroundColor: active
                    ? palContainer
                    : theme.colors.surfaceVariant,
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: palPrimary,
                  }}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                    color: active ? palPrimary : theme.colors.foreground,
                  }}
                >
                  {pal.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SettingsPanel>

      <DashboardWidgetToggles />
      <DashboardWidgetOrder />
    </View>
  );
}
