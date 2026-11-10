import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { ActionMenuSheet, type ActionMenuItem } from "@/components/common/ActionMenuSheet";
import type { ChecklistItem, ReadinessSection } from "@/shared/features/tax/utils/readiness";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The year's checklist (SPENDLY-296): what's left to finish, what's worth a
 * look, what the user put off and what they handled outside Spendly. Each item
 * opens a menu: go to its screen, mark it handled, put it off, or undo.
 */
export function ReadinessChecklist({
  items,
  sectionTitles,
  saving,
  onOpen,
  onDecide,
  onUndo,
}: {
  items: readonly ChecklistItem[];
  sectionTitles: Record<ReadinessSection, string>;
  saving: boolean;
  onOpen: (section: ReadinessSection) => void;
  onDecide: (item: ChecklistItem, decision: "resolve" | "defer") => void;
  onUndo: (item: ChecklistItem) => void;
}) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<ChecklistItem | null>(null);
  const [showDone, setShowDone] = useState(false);

  const groups: { key: string; title: string; items: ChecklistItem[] }[] = [
    { key: "required", title: "To finish", items: items.filter((i) => i.state === "open" && i.required) },
    { key: "optional", title: "Worth a look", items: items.filter((i) => i.state === "open" && !i.required) },
    { key: "deferred", title: "Put off", items: items.filter((i) => i.state === "deferred") },
  ];
  const resolved = items.filter((i) => i.state === "resolved");

  const actions: ActionMenuItem[] = selected
    ? [
        { label: `Open ${sectionTitles[selected.section]}`, onPress: () => onOpen(selected.section) },
        ...(selected.state !== "resolved" ? [{ label: "Mark as handled outside Spendly", disabled: saving, onPress: () => onDecide(selected, "resolve") }] : []),
        ...(selected.state === "open" ? [{ label: "Put off for later", disabled: saving, onPress: () => onDecide(selected, "defer") }] : []),
        ...(selected.state !== "open" ? [{ label: "Back on my list", disabled: saving, onPress: () => onUndo(selected) }] : []),
      ]
    : [];

  if (items.length === 0) {
    return (
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>
        Nothing on your list for this year.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.space.lg }}>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <View key={g.key} style={{ gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.xs, textTransform: "uppercase" }}>
              {g.title} · {g.items.length}
            </Text>
            {g.items.map((i) => (
              <ItemRow key={i.id} item={i} section={sectionTitles[i.section]} onPress={() => setSelected(i)} />
            ))}
          </View>
        ))}
      {resolved.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Pressable onPress={() => setShowDone((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDone }} style={{ minHeight: 48, justifyContent: "center" }}>
            <Text style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
              {showDone ? "Hide" : "Show"} {resolved.length} handled outside Spendly
            </Text>
          </Pressable>
          {showDone ? resolved.map((i) => <ItemRow key={i.id} item={i} section={sectionTitles[i.section]} onPress={() => setSelected(i)} />) : null}
        </View>
      ) : null}
      <ActionMenuSheet isOpen={selected !== null} onClose={() => setSelected(null)} title={selected?.title ?? ""} actions={actions} />
    </View>
  );
}

function ItemRow({ item, section, onPress }: { item: ChecklistItem; section: string; onPress: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const done = item.state === "resolved";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.detail}. ${section}${item.required ? ", needed" : ""}${item.state === "deferred" ? ", put off" : done ? ", handled" : ""}`}
      accessibilityHint="Opens what you can do with this item"
      style={({ pressed }) => [
        styles.row,
        { gap: theme.space.md, paddingVertical: theme.space.md, borderBottomColor: surfaces.divider, backgroundColor: pressed ? surfaces.tile : "transparent" },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: done ? theme.colors.mutedForeground : theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm, textDecorationLine: done ? "line-through" : "none" }}>
          {item.title}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {section} · {item.detail}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
});
