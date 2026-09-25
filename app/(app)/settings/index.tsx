import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Settings as SettingsIcon } from "lucide-react-native";

import { CARD_ORANGE } from "@/components/accounts/accountScreenTheme";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import {
  SettingsGroupLabel,
  SettingsHubRow,
} from "@/components/settings/SettingsHubRow";
import { SETTINGS_SECTION_ICONS } from "@/components/settings/settingsIcons";
import { SearchBar } from "@/components/common/SearchBar";
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  settingsSectionHref,
  type SettingsSectionMeta,
} from "@/shared/config/settingsNav";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function SettingsHubScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { push } = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter((section) => {
      const haystack = `${section.title} ${section.subtitle} ${section.keywords}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const grouped = useMemo(() => {
    return SETTINGS_GROUPS.map((group) => ({
      group,
      sections: filtered.filter((section) => section.group === group.id),
    })).filter((entry) => entry.sections.length > 0);
  }, [filtered]);

  const openSection = (section: SettingsSectionMeta) => {
    push(settingsSectionHref(section.id) as never);
  };

  return (
    <PageShell contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
      <PageHeader
        title="Settings"
        subtitle="Preferences & security"
        icon={
          <SettingsIcon
            size={22}
            color={isDark ? theme.colors.foreground : theme.colors.success}
          />
        }
      />

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search settings..."
        accessibilityLabel="Search settings"
        accentColor={CARD_ORANGE}
      />

      {grouped.length === 0 ? (
        <EmptyState
          illustration="general"
          title="No matching settings"
          description="Try a different name, like PIN, SMS, or theme."
          primaryAction={{
            label: "Clear search",
            onPress: () => setQuery(""),
          }}
          compact
        />
      ) : (
        grouped.map(({ group, sections }) => (
          <View key={group.id} style={styles.group}>
            <SettingsGroupLabel label={group.label} />
            <View style={styles.groupList}>
              {sections.map((section) => (
                <SettingsHubRow
                  key={section.id}
                  title={section.title}
                  subtitle={section.subtitle}
                  icon={SETTINGS_SECTION_ICONS[section.id]}
                  onPress={() => openSection(section)}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  groupList: {
    gap: 8,
  },
});
