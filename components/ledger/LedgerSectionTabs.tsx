import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MoreHorizontal } from "lucide-react-native";

import { accountAccent } from "@/components/accounts/accountScreenTheme";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";
import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import {
  LEDGER_SECTIONS,
  type LedgerHubTabId,
} from "@/shared/config/navigation";

/**
 * Section switcher for the Money hub (SPENDLY-138).
 *
 * Lives outside `PageHeader` on purpose. The header's tab strip is shared with
 * Vaults, Investments and Insights, so reshaping it there would restyle three
 * other hubs; keeping the hub nav local means this screen can change alone.
 *
 * The row scrolls but More is pinned beside it, so the full grouped index is
 * reachable at any width instead of sitting off the right edge — the same
 * arrangement `AccountSectionTabs` uses on Account Detail. Selecting a section
 * also scrolls it into view, because arriving via `?tab=` used to leave the
 * active tab off-screen with the strip still at offset zero.
 */
export function LedgerSectionTabs({
  section,
  onSelect,
  onOpenAllSections,
  counts,
}: {
  section: LedgerHubTabId;
  onSelect: (section: LedgerHubTabId) => void;
  onOpenAllSections: () => void;
  /** Live counts for the sections that have one; absent means no count shown. */
  counts?: Partial<Record<LedgerHubTabId, number>>;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);
  const surfaces = useSurfaces();

  const scrollRef = useRef<ScrollView>(null);
  // Offsets are read imperatively when the selection changes; keeping them in
  // state would re-render the row on every layout pass for no benefit.
  const offsets = useRef<Partial<Record<LedgerHubTabId, number>>>({});

  useEffect(() => {
    const x = offsets.current[section];
    if (x === undefined) return;
    // Leave a little lead-in so the active tab doesn't sit flush against the edge.
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [section]);

  return (
    <View style={styles.wrap}>
      <HorizontalSwipeBoundary>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          // The row is a tablist, not a scroll region, for a screen reader.
          accessibilityRole="tablist"
        >
          {LEDGER_SECTIONS.map((entry) => {
            const selected = entry.id === section;
            const count = counts?.[entry.id];
            const label =
              count === undefined ? entry.label : `${entry.label} (${count})`;
            return (
              <Chip
                key={entry.id}
                label={label}
                selected={selected}
                appearance="outline"
                accentColor={accent}
                haptic={!selected}
                accessibilityRole="tab"
                onLayout={(event) => {
                  offsets.current[entry.id] = event.nativeEvent.layout.x;
                }}
                onPress={() => {
                  if (selected) return;
                  onSelect(entry.id);
                }}
                style={styles.tab}
              />
            );
          })}
        </ScrollView>
      </HorizontalSwipeBoundary>

      <Pressable
        onPress={() => {
          void haptic.selection();
          onOpenAllSections();
        }}
        style={({ pressed }) => [
          styles.more,
          {
            backgroundColor: surfaces.control,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="All sections"
      >
        <MoreHorizontal size={18} color={theme.colors.foreground} />
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
});
