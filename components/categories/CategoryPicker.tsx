import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Check,
  ChevronDown,
  Plus,
  Star,
  X,
} from "lucide-react-native";

import { useCategories } from "@/hooks/useCategories";
import {
  categoryParentMatchesSearch,
  getCategoryIcon,
  isHiddenTaxonomyParent,
} from "@/shared/data/categoryTaxonomy";
import {
  getRecentCategoryPairs,
  pushRecentCategoryPair,
} from "@/shared/utils/categoryPreferences";
import { reconcileSubcategory } from "@/shared/utils/categorySelection";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

import { SearchBar } from "@/components/common/SearchBar";
import { SheetBottomInset } from "@/components/common/SheetBottomInset";

/**
 * SPENDLY-753 — focuses `ref` once `active` becomes true. A bare `autoFocus`
 * prop doesn't reliably focus a RN-Web TextInput that mounts inside a
 * conditionally-rendered block; a ref + effect does, but a single
 * `requestAnimationFrame` can still land one frame too early right after a
 * host Modal mounts/transitions. Retrying across a few frames (stopping as
 * soon as the input reports itself focused) is a cheap, harmless safety net
 * on top of that — it is not a substitute for not nesting this inside a
 * second Modal competing for focus (see ExpenseForm.tsx's web-only overlay
 * for that: two independent Modal/focus-trap implementations stacked makes
 * the outer one win and silently discard every `.focus()` call made here,
 * no matter how many times retried).
 */
function useFocusOnMount(ref: RefObject<TextInput | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const tryFocus = () => {
      if (cancelled) return;
      const node = ref.current;
      const focused = node?.isFocused?.() ?? false;
      if (node && !focused) node.focus();
      attempts += 1;
      if (attempts < 10 && !focused) frame = requestAnimationFrame(tryFocus);
    };
    frame = requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active, ref]);
}

export interface CategoryPickerProps {
  category: string;
  subcategory: string;
  onCategoryChange: (
    category: string,
    subcategory: string,
    options?: { fromUser?: boolean }
  ) => void;
  disabled?: boolean;
  searchable?: boolean;
  label?: string;
  /**
   * Render the two-column picker directly (no nested modal / trigger).
   * Use when the parent already shows a sheet/modal.
   */
  inline?: boolean;
  /** Called when the user finishes a selection (subcategory, or category with no subs). */
  onComplete?: () => void;
}

export function CategoryPicker({
  category,
  subcategory,
  onCategoryChange,
  disabled = false,
  searchable = true,
  label = "Category & Subcategory",
  inline = false,
  onComplete,
}: CategoryPickerProps) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);

  const {
    visibleParents,
    favoriteParents,
    getSubcategories,
    addCategory,
    addSubcategory,
  } = useCategories();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedParentName, setSelectedParentName] = useState(category);
  const [showAddParent, setShowAddParent] = useState(false);
  const [newParentName, setNewParentName] = useState("");
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const [recentPairs, setRecentPairs] = useState(() =>
    getRecentCategoryPairs()
  );

  const onChangeRef = useRef(onCategoryChange);
  onChangeRef.current = onCategoryChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // SPENDLY-753: `autoFocus` alone doesn't reliably focus a RN-Web TextInput
  // that mounts inside this Modal-nested, conditionally-rendered block, and
  // neither does a single requestAnimationFrame — the Modal's own mount/
  // transition is still settling, and a `.focus()` call during that window is
  // silently dropped by the browser (confirmed: the ref and its `.focus`
  // function are both present when called, but `document.activeElement`
  // never moves). Retrying across a few animation frames rides out that
  // window without guessing a fixed delay.
  const newParentInputRef = useRef<TextInput>(null);
  const newSubInputRef = useRef<TextInput>(null);
  useFocusOnMount(newParentInputRef, showAddParent);
  useFocusOnMount(newSubInputRef, showAddSub);

  const activeParent = useMemo(
    () =>
      visibleParents.find((c) => c.name === (selectedParentName || category)),
    [visibleParents, selectedParentName, category]
  );

  const subcategories = useMemo(() => {
    if (!activeParent) return [];
    return getSubcategories(activeParent.id);
  }, [activeParent, getSubcategories]);

  const filteredParents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const parents = visibleParents.filter((c) => !isHiddenTaxonomyParent(c.name));
    if (!q) return parents;
    return parents.filter((c) =>
      categoryParentMatchesSearch(
        c.name,
        getSubcategories(c.id).map((s) => s.name),
        q
      )
    );
  }, [visibleParents, search, getSubcategories]);

  // Keep draft parent in sync when opening / when value changes externally
  useEffect(() => {
    if (category) setSelectedParentName(category);
  }, [category]);

  // Keep the subcategory valid for the parent the form holds. SPENDLY-722:
  // this checks the committed `category` prop, never the draft parent. The
  // draft lags the prop by a render, so validating against it re-sent the old
  // parent whenever the category changed from outside, and the picker and
  // the form overwrote each other in a loop. It only fixes the subcategory.
  const committedParent = useMemo(
    () => visibleParents.find((c) => c.name === category),
    [visibleParents, category]
  );
  useEffect(() => {
    if (!committedParent) return;
    const fix = reconcileSubcategory(
      subcategory,
      getSubcategories(committedParent.id).map((s) => s.name)
    );
    if (fix !== null) {
      onChangeRef.current(committedParent.name, fix, { fromUser: false });
    }
  }, [committedParent, getSubcategories, subcategory]);

  // Initial default if empty
  useEffect(() => {
    if (visibleParents.length === 0) return;
    if (!category || !visibleParents.some((c) => c.name === category)) {
      const first = favoriteParents[0] || visibleParents[0];
      const firstSubs = getSubcategories(first.id);
      onChangeRef.current(first.name, firstSubs[0]?.name ?? "Other", {
        fromUser: false,
      });
    }
  }, [visibleParents, favoriteParents, category, getSubcategories]);

  const finishSelection = (cat: string, sub: string) => {
    haptic.selection().catch(() => undefined);
    onChangeRef.current(cat, sub, { fromUser: true });
    pushRecentCategoryPair(cat, sub);
    setRecentPairs(getRecentCategoryPairs());
    if (!inline) setIsOpen(false);
    onCompleteRef.current?.();
  };

  const handleSelectParent = (parentName: string) => {
    haptic.selection().catch(() => undefined);
    setSelectedParentName(parentName);
    setShowAddSub(false);

    const parent = visibleParents.find((c) => c.name === parentName);
    if (!parent) return;

    const subs = getSubcategories(parent.id);

    // No subcategories → finish immediately (user preference)
    if (subs.length === 0) {
      finishSelection(parentName, "Other");
      return;
    }

    // Keep picker open — wait for explicit subcategory tap.
    // Soft-update form values without fromUser so parents don't close early.
    const previewSub =
      subcategory && subs.some((s) => s.name === subcategory)
        ? subcategory
        : subs[0].name;
    onChangeRef.current(parentName, previewSub, { fromUser: false });
  };

  const handleSelectSub = (subName: string) => {
    if (!activeParent) return;
    finishSelection(activeParent.name, subName);
  };

  const handleCreateParent = async () => {
    if (!newParentName.trim()) return;
    const id = await addCategory(newParentName.trim());
    if (id) {
      setSelectedParentName(newParentName.trim());
      setNewParentName("");
      setShowAddParent(false);
    }
  };

  const handleCreateSub = async () => {
    if (!activeParent || !newSubName.trim()) return;
    const name = newSubName.trim();
    await addSubcategory(activeParent.id, name);
    setNewSubName("");
    setShowAddSub(false);
    finishSelection(activeParent.name, name);
  };

  const pickerBody = (
    <>
      {searchable ? (
        <View style={styles.searchContainer}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories or subcategories..."
          />
        </View>
      ) : null}

      {recentPairs.length > 0 && !search ? (
        <View style={styles.recentSection}>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}
          >
            RECENT
          </Text>
          <HorizontalSwipeBoundary>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {recentPairs.map((p, idx) => (
                <Pressable
                  key={`recent-${idx}`}
                  onPress={() => finishSelection(p.category, p.subcategory)}
                  style={({ pressed }) => [
                    styles.chipPill,
                    {
                      backgroundColor: surfaces.control,
                      borderColor: theme.colors.border,
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.chipEmoji}>
                    {getCategoryIcon(p.category)}
                  </Text>
                  <Text
                    style={[styles.chipText, { color: theme.colors.foreground }]}
                  >
                    {p.category} › {p.subcategory}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </HorizontalSwipeBoundary>
        </View>
      ) : null}

      <View style={styles.splitColumns}>
        <View
          style={[
            styles.parentsColumn,
            { borderRightColor: theme.colors.border },
          ]}
        >
          <View style={styles.columnHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              PARENT ({filteredParents.length})
            </Text>
            <Pressable
              onPress={() => setShowAddParent(true)}
              hitSlop={8}
              style={styles.addInlineBtn}
            >
              <Plus size={14} color={theme.colors.primary} />
            </Pressable>
          </View>

          {showAddParent ? (
            <View style={styles.inlineAddBox}>
              <TextInput
                ref={newParentInputRef}
                value={newParentName}
                onChangeText={setNewParentName}
                placeholder="Category name"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.inlineInput,
                  {
                    color: theme.colors.foreground,
                    borderColor: theme.colors.border,
                  },
                ]}
                autoFocus
              />
              <View style={styles.inlineActionRow}>
                <Pressable
                  onPress={handleCreateParent}
                  style={[
                    styles.inlineSaveBtn,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.inlineSaveText,
                      { color: theme.colors.primaryForeground },
                    ]}
                  >
                    Add
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setNewParentName("");
                    setShowAddParent(false);
                  }}
                  style={styles.inlineCancelBtn}
                >
                  <Text
                    style={[
                      styles.inlineCancelText,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredParents.map((parent) => {
              const isSelected =
                (selectedParentName || category) === parent.name;
              return (
                <Pressable
                  key={parent.id}
                  onPress={() => handleSelectParent(parent.name)}
                  style={({ pressed }) => [
                    styles.parentRow,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? "rgba(107, 99, 255, 0.2)"
                          : "rgba(79, 70, 255, 0.12)"
                        : "transparent",
                      borderColor: isSelected
                        ? theme.colors.primary
                        : "transparent",
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.parentEmoji}>
                    {parent.icon || getCategoryIcon(parent.name)}
                  </Text>
                  <Text
                    style={[
                      styles.parentName,
                      {
                        color: isSelected
                          ? theme.colors.primary
                          : theme.colors.foreground,
                        fontWeight: isSelected ? "700" : "500",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {parent.name}
                  </Text>
                  {parent.isFavorite ? (
                    <Star
                      size={12}
                      color={theme.colors.warning}
                      fill={theme.colors.warning}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.subsColumn}>
          <View style={styles.columnHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              SUBCATEGORY ({subcategories.length})
            </Text>
            {activeParent ? (
              <Pressable
                onPress={() => setShowAddSub(true)}
                hitSlop={8}
                style={styles.addInlineBtn}
              >
                <Plus size={14} color={theme.colors.primary} />
              </Pressable>
            ) : null}
          </View>

          {!activeParent ? (
            <Text
              style={[
                styles.emptyHint,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Select a category first
            </Text>
          ) : null}

          {activeParent && subcategories.length > 0 ? (
            <Text
              style={[
                styles.pickHint,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Tap a subcategory to confirm
            </Text>
          ) : null}

          {showAddSub ? (
            <View style={styles.inlineAddBox}>
              <TextInput
                ref={newSubInputRef}
                value={newSubName}
                onChangeText={setNewSubName}
                placeholder="Subcategory name"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.inlineInput,
                  {
                    color: theme.colors.foreground,
                    borderColor: theme.colors.border,
                  },
                ]}
                autoFocus
              />
              <View style={styles.inlineActionRow}>
                <Pressable
                  onPress={handleCreateSub}
                  style={[
                    styles.inlineSaveBtn,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.inlineSaveText,
                      { color: theme.colors.primaryForeground },
                    ]}
                  >
                    Add
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setNewSubName("");
                    setShowAddSub(false);
                  }}
                  style={styles.inlineCancelBtn}
                >
                  <Text
                    style={[
                      styles.inlineCancelText,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {subcategories.map((sub) => {
              const parentMatches =
                category === (selectedParentName || category);
              const isSelected = parentMatches && subcategory === sub.name;
              return (
                <Pressable
                  key={sub.id}
                  onPress={() => handleSelectSub(sub.name)}
                  style={({ pressed }) => [
                    styles.subRow,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? "rgba(107, 99, 255, 0.2)"
                          : "rgba(79, 70, 255, 0.12)"
                        : "transparent",
                      borderColor: isSelected
                        ? theme.colors.primary
                        : "transparent",
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.subName,
                      {
                        color: isSelected
                          ? theme.colors.primary
                          : theme.colors.foreground,
                        fontWeight: isSelected ? "700" : "500",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {sub.name}
                  </Text>
                  {isSelected ? (
                    <Check size={14} color={theme.colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </>
  );

  if (inline) {
    return (
      <View style={[styles.inlineRoot, disabled && { opacity: 0.6 }]} pointerEvents={disabled ? "none" : "auto"}>
        {pickerBody}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={() => {
          if (!disabled) {
            setSelectedParentName(category);
            setIsOpen(true);
          }
        }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.triggerButton,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            opacity: disabled ? 0.6 : 1,
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.triggerLeft}>
          <Text style={styles.iconEmoji}>{getCategoryIcon(category)}</Text>
          <View style={styles.triggerTextContainer}>
            <Text
              style={[styles.categoryText, { color: theme.colors.foreground }]}
            >
              {category || "Select Category"}
            </Text>
            <Text
              style={[styles.subText, { color: theme.colors.mutedForeground }]}
            >
              {subcategory ? `›  ${subcategory}` : "Choose subcategory"}
            </Text>
          </View>
        </View>

        <ChevronDown size={18} color={theme.colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: theme.colors.border },
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: theme.colors.foreground },
                  ]}
                >
                  Select Category
                </Text>
                <Text
                  style={[
                    styles.modalSubtitle,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  Choose parent, then subcategory
                </Text>
              </View>

              <Pressable
                onPress={() => setIsOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  { backgroundColor: theme.colors.muted },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <X size={18} color={theme.colors.foreground} />
              </Pressable>
            </View>

            {pickerBody}
            <SheetBottomInset />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  inlineRoot: {
    flex: 1,
    minHeight: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  triggerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  triggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconEmoji: {
    fontSize: 22,
  },
  triggerTextContainer: {
    flex: 1,
    gap: 2,
  },
  categoryText: {
    fontSize: 15,
    fontWeight: "700",
  },
  subText: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    height: "82%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  recentSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipsRow: {
    gap: 8,
  },
  chipPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipEmoji: {
    fontSize: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  splitColumns: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  parentsColumn: {
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  subsColumn: {
    flex: 1.1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  addInlineBtn: {
    padding: 4,
  },
  inlineAddBox: {
    gap: 6,
    marginBottom: 8,
  },
  inlineInput: {
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  inlineActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineSaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inlineSaveText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inlineCancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  inlineCancelText: {
    fontSize: 11,
  },
  parentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  parentEmoji: {
    fontSize: 16,
  },
  parentName: {
    flex: 1,
    fontSize: 13,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  subName: {
    flex: 1,
    fontSize: 13,
  },
  emptyHint: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  pickHint: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
});
