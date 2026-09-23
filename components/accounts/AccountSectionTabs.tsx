import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MoreHorizontal } from "lucide-react-native";

import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import {
  ACCOUNT_SECTIONS,
  type AccountSectionId,
} from "@/shared/utils/accountActions";

/**
 * Section switcher and action trigger for Account Detail (SPENDLY-91).
 *
 * Deliberately not in the app bar. The header already carries identity,
 * the edit affordance and `AppBarActions` (search, inbox, profile); adding a
 * fourth control there would crowd a 56pt row on a small phone. Keeping the
 * switcher in the content means it also scrolls into a predictable place
 * rather than floating over the balance.
 *
 * The tabs scroll horizontally and the More button is pinned, so the action
 * center stays reachable at any width rather than scrolling off the right edge
 * on a small screen — which is exactly where it would go, since it sits after
 * the longest label.
 */
export function AccountSectionTabs({
  section,
  onSelect,
  onOpenActions,
  /** Shown on the More button so unfinished uploads are visible from any tab. */
  attentionCount = 0,
}: {
  section: AccountSectionId;
  onSelect: (section: AccountSectionId) => void;
  onOpenActions: () => void;
  attentionCount?: number;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const neutralBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)";

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        // The row is a tablist, not a scroll region, for a screen reader.
        accessibilityRole="tablist"
      >
        {ACCOUNT_SECTIONS.map((entry) => {
          const selected = entry.id === section;
          return (
            <Pressable
              key={entry.id}
              onPress={() => {
                if (selected) return;
                void haptic.selection();
                onSelect(entry.id);
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: neutralBg,
                  borderColor: selected ? accent : "transparent",
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={entry.label}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: selected ? accent : theme.colors.foreground },
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => {
          void haptic.selection();
          onOpenActions();
        }}
        style={({ pressed }) => [
          styles.more,
          {
            backgroundColor: neutralBg,
            borderColor: isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)",
            opacity: pressed ? 0.6 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          attentionCount > 0
            ? `Account actions, ${attentionCount} needing attention`
            : "Account actions"
        }
      >
        <MoreHorizontal size={18} color={theme.colors.foreground} />
        {attentionCount > 0 ? (
          <View style={[styles.dot, { backgroundColor: theme.colors.destructive }]} />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tabs: {
    gap: 8,
    paddingRight: 4,
  },
  tab: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  more: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
