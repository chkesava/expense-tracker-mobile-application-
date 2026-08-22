import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  GitMerge,
  Palette,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react-native";

import { useCategories } from "@/hooks/useCategories";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import {
  CATEGORY_COLOR_PRESETS,
  CATEGORY_ICON_PRESETS,
} from "@/shared/utils/categoryPreferences";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

export function CategoryManager() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const {
    parentCategories,
    getSubcategories,
    addCategory,
    addSubcategory,
    renameCategory,
    setCategoryHidden,
    setCategoryFavorite,
    setCategoryStyle,
    archiveCategory,
    deleteCategory,
    mergeCategories,
  } = useCategories();

  const [search, setSearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubByParent, setNewSubByParent] = useState<Record<string, string>>({});

  // Style modal state
  const [styleTargetId, setStyleTargetId] = useState<string | null>(null);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
    isSub?: boolean;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parentCategories;
    return parentCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        getSubcategories(c.id, { includeHidden: true }).some((s) =>
          s.name.toLowerCase().includes(q)
        )
    );
  }, [parentCategories, search, getSubcategories]);

  const handleAddParent = async () => {
    if (!newCategoryName.trim()) return;
    await addCategory(newCategoryName.trim());
    setNewCategoryName("");
  };

  const handleAddSub = async (parentId: string) => {
    const val = newSubByParent[parentId]?.trim();
    if (!val) return;
    await addSubcategory(parentId, val);
    setNewSubByParent((prev) => ({ ...prev, [parentId]: "" }));
  };

  const handleSaveRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await renameCategory(renameTarget.id, renameValue.trim(), true);
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleConfirmMerge = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      return;
    }
    await mergeCategories(mergeSourceId, mergeTargetId);
    setShowMergeModal(false);
    setMergeSourceId("");
    setMergeTargetId("");
  };

  const handleDeletePrompt = (id: string, name: string) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete “${name}” and all its subcategories?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCategory(id),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Add Bar */}
      <View style={styles.headerSection}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Search size={16} color={theme.colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories & subcategories..."
            placeholderTextColor={theme.colors.mutedForeground}
            style={[styles.searchInput, { color: theme.colors.foreground }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <X size={16} color={theme.colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.addCategoryRow}>
          <TextInput
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            placeholder="New parent category..."
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.addCategoryInput,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                color: theme.colors.foreground,
              },
            ]}
          />
          <Pressable
            onPress={handleAddParent}
            disabled={!newCategoryName.trim()}
            style={({ pressed }) => [
              styles.addCategoryBtn,
              {
                backgroundColor: theme.colors.primary,
                opacity: !newCategoryName.trim() ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Plus size={18} color={theme.colors.primaryForeground} />
            <Text
              style={[
                styles.addCategoryBtnText,
                { color: theme.colors.primaryForeground },
              ]}
            >
              Add
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowMergeModal(true)}
            style={({ pressed }) => [
              styles.mergeToolBtn,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <GitMerge size={16} color={theme.colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Category List Accordion */}
      <ScrollView
        style={styles.categoriesList}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, gap: 10 }}
      >
        {filtered.map((parent) => {
          const isExpanded = expandedId === parent.id;
          const subs = getSubcategories(parent.id, { includeHidden: true });
          const newSubVal = newSubByParent[parent.id] || "";

          return (
            <View
              key={parent.id}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              {/* Parent Row */}
              <View style={styles.parentRow}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setExpandedId(isExpanded ? null : parent.id);
                  }}
                  style={styles.parentTitleArea}
                >
                  {isExpanded ? (
                    <ChevronDown size={18} color={theme.colors.mutedForeground} />
                  ) : (
                    <ChevronRight size={18} color={theme.colors.mutedForeground} />
                  )}
                  <Text style={styles.parentIcon}>
                    {parent.icon || getCategoryIcon(parent.name)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.parentName,
                        { color: theme.colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {parent.name}
                    </Text>
                    <Text
                      style={[
                        styles.parentCount,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      {subs.length} subcategories
                    </Text>
                  </View>
                </Pressable>

                {/* Actions Toolbar */}
                <View style={styles.actionIconsRow}>
                  <Pressable
                    onPress={() =>
                      setCategoryFavorite(parent.id, !parent.isFavorite)
                    }
                    hitSlop={6}
                  >
                    <Star
                      size={16}
                      color={
                        parent.isFavorite
                          ? theme.colors.warning
                          : theme.colors.mutedForeground
                      }
                      fill={parent.isFavorite ? theme.colors.warning : "none"}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      setCategoryHidden(parent.id, !parent.isHidden)
                    }
                    hitSlop={6}
                  >
                    {parent.isHidden ? (
                      <EyeOff size={16} color={theme.colors.mutedForeground} />
                    ) : (
                      <Eye size={16} color={theme.colors.mutedForeground} />
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => setStyleTargetId(parent.id)}
                    hitSlop={6}
                  >
                    <Palette size={16} color={theme.colors.mutedForeground} />
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setRenameTarget({ id: parent.id, name: parent.name });
                      setRenameValue(parent.name);
                    }}
                    hitSlop={6}
                  >
                    <Pencil size={16} color={theme.colors.mutedForeground} />
                  </Pressable>

                  <Pressable
                    onPress={() => handleDeletePrompt(parent.id, parent.name)}
                    hitSlop={6}
                  >
                    <Trash2 size={16} color={theme.colors.destructive} />
                  </Pressable>
                </View>
              </View>

              {/* Subcategories Accordion Content */}
              {isExpanded && (
                <View
                  style={[
                    styles.subsContent,
                    {
                      borderTopColor: theme.colors.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  {/* Inline Add Subcategory */}
                  <View style={styles.addSubRow}>
                    <TextInput
                      value={newSubVal}
                      onChangeText={(val) =>
                        setNewSubByParent((prev) => ({
                          ...prev,
                          [parent.id]: val,
                        }))
                      }
                      placeholder="Add subcategory..."
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[
                        styles.addSubInput,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.03)",
                          borderColor: theme.colors.border,
                          color: theme.colors.foreground,
                        },
                      ]}
                    />
                    <Pressable
                      onPress={() => handleAddSub(parent.id)}
                      disabled={!newSubVal}
                      style={[
                        styles.addSubBtn,
                        {
                          backgroundColor: theme.colors.primary,
                          opacity: !newSubVal ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Plus size={14} color={theme.colors.primaryForeground} />
                    </Pressable>
                  </View>

                  {/* Subcategories items */}
                  {subs.map((sub) => (
                    <View
                      key={sub.id}
                      style={[
                        styles.subItemRow,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.02)"
                            : "rgba(0,0,0,0.02)",
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.subItemName,
                          { color: theme.colors.foreground },
                        ]}
                      >
                        {sub.name}
                      </Text>

                      <View style={styles.subActions}>
                        <Pressable
                          onPress={() =>
                            setCategoryHidden(sub.id, !sub.isHidden)
                          }
                          hitSlop={6}
                        >
                          {sub.isHidden ? (
                            <EyeOff
                              size={14}
                              color={theme.colors.mutedForeground}
                            />
                          ) : (
                            <Eye
                              size={14}
                              color={theme.colors.mutedForeground}
                            />
                          )}
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            setRenameTarget({
                              id: sub.id,
                              name: sub.name,
                              isSub: true,
                            });
                            setRenameValue(sub.name);
                          }}
                          hitSlop={6}
                        >
                          <Pencil
                            size={14}
                            color={theme.colors.mutedForeground}
                          />
                        </Pressable>

                        <Pressable
                          onPress={() => deleteCategory(sub.id)}
                          hitSlop={6}
                        >
                          <Trash2
                            size={14}
                            color={theme.colors.destructive}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Style (Icon & Color) Modal */}
      <Modal
        visible={!!styleTargetId}
        transparent
        animationType="fade"
        onRequestClose={() => setStyleTargetId(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalDialog,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.dialogHeader}>
              <Text
                style={[styles.dialogTitle, { color: theme.colors.foreground }]}
              >
                Customize Category Style
              </Text>
              <Pressable onPress={() => setStyleTargetId(null)}>
                <X size={18} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>

            <Text
              style={[
                styles.dialogSectionTitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              CHOOSE ICON
            </Text>
            <View style={styles.iconsGrid}>
              {CATEGORY_ICON_PRESETS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (styleTargetId) {
                      setCategoryStyle(styleTargetId, { icon: emoji });
                      setStyleTargetId(null);
                    }
                  }}
                  style={styles.emojiCell}
                >
                  <Text style={styles.gridEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <Text
              style={[
                styles.dialogSectionTitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              CHOOSE COLOR
            </Text>
            <View style={styles.colorsGrid}>
              {CATEGORY_COLOR_PRESETS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => {
                    if (styleTargetId) {
                      setCategoryStyle(styleTargetId, { color });
                      setStyleTargetId(null);
                    }
                  }}
                  style={[styles.colorCell, { backgroundColor: color }]}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalDialog,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.dialogHeader}>
              <Text
                style={[styles.dialogTitle, { color: theme.colors.foreground }]}
              >
                Rename {renameTarget?.isSub ? "Subcategory" : "Category"}
              </Text>
              <Pressable onPress={() => setRenameTarget(null)}>
                <X size={18} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>

            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Enter new name"
              placeholderTextColor={theme.colors.mutedForeground}
              style={[
                styles.dialogInput,
                {
                  color: theme.colors.foreground,
                  borderColor: theme.colors.border,
                },
              ]}
              autoFocus
            />

            <View style={styles.dialogButtonsRow}>
              <Pressable
                onPress={() => setRenameTarget(null)}
                style={styles.dialogCancelBtn}
              >
                <Text style={{ color: theme.colors.mutedForeground }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveRename}
                style={[
                  styles.dialogConfirmBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={{ color: theme.colors.primaryForeground, fontWeight: "700" }}>
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Merge Modal */}
      <Modal
        visible={showMergeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMergeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalDialog,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.dialogHeader}>
              <Text
                style={[styles.dialogTitle, { color: theme.colors.foreground }]}
              >
                Merge Categories
              </Text>
              <Pressable onPress={() => setShowMergeModal(false)}>
                <X size={18} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>

            <Text
              style={[
                styles.mergeDescription,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Move all expenses and subcategories from Source category into Target category, then delete Source.
            </Text>

            <Text
              style={[
                styles.dialogSectionTitle,
                { color: theme.colors.mutedForeground },
              ]}
            >
              SOURCE CATEGORY (Will be deleted)
            </Text>
            <HorizontalSwipeBoundary>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mergePillsRow}
              >
                {parentCategories.map((p) => (
                  <Pressable
                    key={`src-${p.id}`}
                    onPress={() => setMergeSourceId(p.id)}
                    style={[
                      styles.mergePill,
                      {
                        backgroundColor:
                          mergeSourceId === p.id
                            ? theme.colors.destructive
                            : isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                        borderColor:
                          mergeSourceId === p.id
                            ? theme.colors.destructive
                            : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          mergeSourceId === p.id
                            ? "#fff"
                            : theme.colors.foreground,
                        fontSize: 12,
                        fontWeight: mergeSourceId === p.id ? "700" : "500",
                      }}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </HorizontalSwipeBoundary>

            <Text
              style={[
                styles.dialogSectionTitle,
                { color: theme.colors.mutedForeground, marginTop: 12 },
              ]}
            >
              TARGET CATEGORY (Will receive data)
            </Text>
            <HorizontalSwipeBoundary>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mergePillsRow}
              >
                {parentCategories
                  .filter((p) => p.id !== mergeSourceId)
                  .map((p) => (
                    <Pressable
                      key={`tgt-${p.id}`}
                      onPress={() => setMergeTargetId(p.id)}
                      style={[
                        styles.mergePill,
                        {
                          backgroundColor:
                            mergeTargetId === p.id
                              ? theme.colors.primary
                              : isDark
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.04)",
                          borderColor:
                            mergeTargetId === p.id
                              ? theme.colors.primary
                              : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            mergeTargetId === p.id
                              ? theme.colors.primaryForeground
                              : theme.colors.foreground,
                          fontSize: 12,
                          fontWeight: mergeTargetId === p.id ? "700" : "500",
                        }}
                      >
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
            </HorizontalSwipeBoundary>

            <View style={styles.dialogButtonsRow}>
              <Pressable
                onPress={() => setShowMergeModal(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={{ color: theme.colors.mutedForeground }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmMerge}
                disabled={!mergeSourceId || !mergeTargetId}
                style={[
                  styles.dialogConfirmBtn,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: !mergeSourceId || !mergeTargetId ? 0.5 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.primaryForeground,
                    fontWeight: "700",
                  }}
                >
                  Merge
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  headerSection: {
    gap: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  addCategoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  addCategoryInput: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  addCategoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addCategoryBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  mergeToolBtn: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  categoriesList: {
    flex: 1,
  },
  categoryCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  parentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  parentTitleArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  parentIcon: {
    fontSize: 20,
  },
  parentName: {
    fontSize: 14,
    fontWeight: "700",
  },
  parentCount: {
    fontSize: 11,
    marginTop: 2,
  },
  actionIconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  subsContent: {
    padding: 12,
    gap: 8,
  },
  addSubRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  addSubInput: {
    flex: 1,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  addSubBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  subItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  subItemName: {
    fontSize: 13,
    fontWeight: "500",
  },
  subActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalDialog: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  dialogSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  iconsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiCell: {
    padding: 6,
    borderRadius: 8,
  },
  gridEmoji: {
    fontSize: 22,
  },
  colorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorCell: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  dialogInput: {
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  dialogButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  dialogCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dialogConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  mergeDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  mergePillsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  mergePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
});
