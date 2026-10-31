import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Pencil, Trash2 } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Input } from "@/components/ui/Input";
import { appDialog } from "@/lib/appDialog";
import { deleteScreen, saveScreen, updateScreen } from "@/lib/screenerSavedScreens";
import { MAX_SAVED_SCREENS, type SavedScreen } from "@/shared/utils/savedScreens";
import { SCREENER_PRESETS, describeScreen, type Screen, type SortFieldId } from "@/shared/utils/screener";
import { SORT_OPTIONS } from "@/shared/utils/screenerView";
import { useTheme } from "@/theme/ThemeProvider";

/** Pick the sort field and direction (SPENDLY-651). */
export function ScreenerSortSheet({
  isOpen,
  onClose,
  sort,
  onChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  sort: Screen["sort"];
  onChange: (sort: Screen["sort"]) => void;
}) {
  const { theme } = useTheme();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sort by" density="compact">
      <View style={styles.list}>
        <SegmentedControl<"desc" | "asc">
          options={[
            { value: "desc", label: "High to low", icon: (c) => <ArrowDownWideNarrow size={14} color={c} /> },
            { value: "asc", label: "Low to high", icon: (c) => <ArrowUpNarrowWide size={14} color={c} /> },
          ]}
          value={sort.direction}
          onChange={(direction) => onChange({ ...sort, direction })}
        />
        {SORT_OPTIONS.map((option) => {
          const selected = option.field === sort.field;
          return (
            <Pressable
              key={option.field}
              onPress={() => onChange({ ...sort, field: option.field as SortFieldId })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: selected ? theme.fontFamily.semibold : theme.fontFamily.regular }}>
                {option.label}
              </Text>
              {selected ? <Check size={16} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        })}
        <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular }}>
          Stocks without a value for the sort field are listed last.
        </Text>
      </View>
    </Modal>
  );
}

/**
 * Presets, saved screens and "save this screen" (SPENDLY-651). Saved screens
 * live on this device only (SPENDLY-649).
 */
export function ScreenerSavedSheet({
  isOpen,
  onClose,
  screen,
  saved,
  onLoad,
}: {
  isOpen: boolean;
  onClose: () => void;
  screen: Screen;
  saved: readonly SavedScreen[];
  onLoad: (screen: Screen) => void;
}) {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setError(null);
    setRenaming(null);
  }, [isOpen]);

  const save = async () => {
    const result = await saveScreen(name, screen);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName("");
    setError(null);
  };

  const rename = async (id: string) => {
    const result = await updateScreen(id, { name: renameText });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRenaming(null);
    setError(null);
  };

  const confirmDelete = (item: SavedScreen) =>
    appDialog.alert(`Delete "${item.name}"?`, "This removes the saved screen from this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteScreen(item.id) },
    ]);

  const text = (size: "xs" | "sm", color = theme.colors.foreground, family = theme.fontFamily.regular) => ({
    color,
    fontSize: theme.typography[size],
    fontFamily: family,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Screens"
      maxHeight="90%"
      density="compact"
      footer={<SheetActions primary={{ label: "Save this screen", onPress: () => void save(), disabled: saved.length >= MAX_SAVED_SCREENS }} />}
    >
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Input
          label={`Save the current filters (${saved.length} of ${MAX_SAVED_SCREENS})`}
          placeholder="Name, e.g. IT near highs"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          maxLength={40}
          error={error ?? undefined}
          helperText={describeScreen(screen).join(" · ") || "No filters: every NIFTY 500 stock."}
        />

        <Text style={text("sm", theme.colors.foreground, theme.fontFamily.semibold)}>Your screens</Text>
        {saved.length === 0 ? (
          <Text style={text("xs", theme.colors.mutedForeground)}>No saved screens yet. They're kept on this device.</Text>
        ) : (
          saved.map((item) =>
            renaming === item.id ? (
              <View key={item.id} style={styles.renameRow}>
                <Input value={renameText} onChangeText={setRenameText} maxLength={40} containerStyle={styles.flex} accessibilityLabel="New name" autoFocus />
                <Pressable onPress={() => void rename(item.id)} accessibilityRole="button" accessibilityLabel="Save name" hitSlop={8}>
                  <Check size={18} color={theme.colors.primary} />
                </Pressable>
              </View>
            ) : (
              <View key={item.id} style={styles.row}>
                <Pressable
                  onPress={() => onLoad(item.screen)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.name}`}
                  style={({ pressed }) => [styles.flex, pressed && { opacity: 0.6 }]}
                >
                  <Text style={text("sm", theme.colors.foreground, theme.fontFamily.semibold)}>{item.name}</Text>
                  <Text style={text("xs", theme.colors.mutedForeground)} numberOfLines={1}>
                    {describeScreen(item.screen).join(" · ") || "No filters"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setRenaming(item.id);
                    setRenameText(item.name);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${item.name}`}
                  hitSlop={8}
                >
                  <Pencil size={16} color={theme.colors.mutedForeground} />
                </Pressable>
                <Pressable onPress={() => confirmDelete(item)} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} hitSlop={8}>
                  <Trash2 size={16} color={theme.colors.destructive} />
                </Pressable>
              </View>
            )
          )
        )}

        <Text style={text("sm", theme.colors.foreground, theme.fontFamily.semibold)}>Ready-made</Text>
        {SCREENER_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => onLoad(preset.screen)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${preset.name}`}
            style={({ pressed }) => [styles.preset, pressed && { opacity: 0.6 }]}
          >
            <Text style={text("sm", theme.colors.foreground, theme.fontFamily.semibold)}>{preset.name}</Text>
            <Text style={text("xs", theme.colors.mutedForeground)}>{preset.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, paddingBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
  renameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  preset: { gap: 2, paddingVertical: 6 },
  flex: { flex: 1 },
});
