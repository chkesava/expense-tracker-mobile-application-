import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { AboutSection } from "@/components/settings/sections/AboutSection";
import { AccountsSection } from "@/components/settings/sections/AccountsSection";
import { AppearanceSection } from "@/components/settings/sections/AppearanceSection";
import { AutomationSection } from "@/components/settings/sections/AutomationSection";
import { MoneySection } from "@/components/settings/sections/MoneySection";
import { PreferencesSection } from "@/components/settings/sections/PreferencesSection";
import { PrivacySection } from "@/components/settings/sections/PrivacySection";
import { ProfileSection } from "@/components/settings/sections/ProfileSection";
import { SETTINGS_SECTION_ICONS } from "@/components/settings/settingsIcons";
import {
  isSettingsSectionId,
  SETTINGS_SECTIONS,
} from "@/shared/config/settingsNav";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function SettingsSectionScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { back } = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const sectionId = Array.isArray(params.section)
    ? params.section[0]
    : params.section;

  if (!isSettingsSectionId(sectionId)) {
    return <Redirect href="/settings" />;
  }

  const meta = SETTINGS_SECTIONS.find((item) => item.id === sectionId);
  if (!meta) {
    return <Redirect href="/settings" />;
  }

  const Icon = SETTINGS_SECTION_ICONS[sectionId];

  return (
    <PageShell contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        onBack={() => back()}
        icon={
          <Icon
            size={22}
            color={isDark ? "#FFFFFF" : theme.colors.success}
            strokeWidth={2.2}
          />
        }
      />
      {sectionId === "profile" ? <ProfileSection /> : null}
      {sectionId === "appearance" ? <AppearanceSection /> : null}
      {sectionId === "preferences" ? <PreferencesSection /> : null}
      {sectionId === "money" ? <MoneySection /> : null}
      {sectionId === "accounts" ? <AccountsSection /> : null}
      {sectionId === "automation" ? <AutomationSection /> : null}
      {sectionId === "privacy" ? <PrivacySection /> : null}
      {sectionId === "about" ? <AboutSection /> : null}
    </PageShell>
  );
}
