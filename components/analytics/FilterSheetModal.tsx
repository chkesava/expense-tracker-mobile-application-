import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RotateCcw, X } from "lucide-react-native";

import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { haptic } from "@/lib/haptics";
import { useAccounts } from "@/hooks/useAccounts";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type DatePreset = "all" | "this_month" | "last_30_days" | "this_year";

export interface LabFilters {
  query: string;
  type: "all" | "expense" | "income";
  datePreset: DatePreset;
  categories: string[];
  accountIds: string[];
  minAmount: string;
  maxAmount: string;
}

export interface FilterSheetModalProps {
  visible: boolean;
  onClose: () => void;
  filters: LabFilters;
  onApply: (filters: LabFilters) => void;
  availableCategories: string[];
}

export function FilterSheetModal({
  visible,
  onClose,
  filters,
  onApply,
  availableCategories,
}: FilterSheetModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();

  const [draft, setDraft] = React.useState<LabFilters>(filters);

  React.useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggleCategory = (cat: string) => {
    void haptic.selection();
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const toggleAccount = (accId: string) => {
    void haptic.selection();
    setDraft((prev) => ({
      ...prev,
      accountIds: prev.accountIds.includes(accId)
        ? prev.accountIds.filter((id) => id !== accId)
        : [...prev.accountIds, accId],
    }));
  };

  const handleReset = () => {
    void haptic.warning();
    setDraft({
      query: draft.query,
      type: "all",
      datePreset: "all",
      categories: [],
      accountIds: [],
      minAmount: "",
      maxAmount: "",
    });
  };

  const handleSave = () => {
    void haptic.selection();
    onApply(draft);
    onClose();
  };

  /** Shared chip renderer — emerald when selected, dark surface otherwise. */
  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? accents.greenDim : surface.inset,
          borderColor: selected
            ? isDark
              ? "rgba(74, 222, 128, 0.45)"
              : "rgba(22, 163, 74, 0.32)"
            : surface.insetBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected ? accents.green : theme.colors.foreground,
            fontWeight: selected ? "700" : "500",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const sectionTitle = (label: string, trailing?: string) => (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      {trailing ? (
        <Text style={[styles.sectionTrailing, { color: theme.colors.mutedForeground }]}>
          {trailing}
        </Text>
      ) : null}
    </View>
  );

  const amountInput = (
    label: string,
    value: string,
    placeholder: string,
    onChangeText: (next: string) => void
  ) => (
    <View style={styles.amountInputCol}>
      <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        keyboardType="numeric"
        style={[
          styles.input,
          {
            backgroundColor: surface.inset,
            borderColor: surface.insetBorder,
            color: theme.colors.foreground,
          },
        ]}
      />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropFill}
          accessibilityLabel="Dismiss filters"
          onPress={onClose}
        />
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: surface.card,
              borderColor: surface.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: surface.hairline }]} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>
                Filters
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                Refine discovery with multi-faceted criteria
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: surface.inset, borderColor: surface.insetBorder },
                pressed && styles.pressed,
              ]}
            >
              <X size={18} color={theme.colors.mutedForeground} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Transaction Type */}
            <View style={styles.section}>
              {sectionTitle("TRANSACTION TYPE")}
              <View style={styles.chipRow}>
                {(["all", "expense", "income"] as const).map((t) =>
                  chip(
                    t,
                    t === "all" ? "All Types" : t === "expense" ? "Expenses" : "Incomes",
                    draft.type === t,
                    () => {
                      void haptic.selection();
                      setDraft((p) => ({ ...p, type: t }));
                    }
                  )
                )}
              </View>
            </View>

            {/* Date Range Preset */}
            <View style={styles.section}>
              {sectionTitle("DATE RANGE")}
              <View style={styles.chipRow}>
                {(
                  [
                    { id: "all", label: "All Time" },
                    { id: "this_month", label: "This Month" },
                    { id: "last_30_days", label: "Last 30 Days" },
                    { id: "this_year", label: "This Year" },
                  ] as const
                ).map((dp) =>
                  chip(dp.id, dp.label, draft.datePreset === dp.id, () => {
                    void haptic.selection();
                    setDraft((p) => ({ ...p, datePreset: dp.id }));
                  })
                )}
              </View>
            </View>

            {/* Amount Range */}
            <View style={styles.section}>
              {sectionTitle("AMOUNT RANGE")}
              <View style={styles.amountInputsRow}>
                {amountInput("Min Amount", draft.minAmount, "0", (t) =>
                  setDraft((p) => ({ ...p, minAmount: t }))
                )}
                {amountInput("Max Amount", draft.maxAmount, "No limit", (t) =>
                  setDraft((p) => ({ ...p, maxAmount: t }))
                )}
              </View>
            </View>

            {/* Categories */}
            {availableCategories.length > 0 && (
              <View style={styles.section}>
                {sectionTitle(
                  "CATEGORIES",
                  draft.categories.length ? `${draft.categories.length} selected` : "All"
                )}
                <View style={styles.chipRow}>
                  {availableCategories.map((cat) =>
                    chip(cat, cat, draft.categories.includes(cat), () =>
                      toggleCategory(cat)
                    )
                  )}
                </View>
              </View>
            )}

            {/* Accounts */}
            {accounts.length > 0 && (
              <View style={styles.section}>
                {sectionTitle(
                  "ACCOUNTS",
                  draft.accountIds.length ? `${draft.accountIds.length} selected` : "All"
                )}
                <View style={styles.chipRow}>
                  {accounts.map((acc) =>
                    chip(acc.id, acc.name, draft.accountIds.includes(acc.id), () =>
                      toggleAccount(acc.id)
                    )
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: surface.hairline }]}>
            <Pressable
              onPress={handleReset}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.footerBtn,
                { backgroundColor: surface.inset, borderColor: surface.insetBorder },
                pressed && styles.pressed,
              ]}
            >
              <RotateCcw size={15} color={theme.colors.foreground} strokeWidth={2.3} />
              <Text style={[styles.footerBtnText, { color: theme.colors.foreground }]}>
                Clear All
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.footerBtn,
                {
                  backgroundColor: accents.greenDim,
                  borderColor: isDark
                    ? "rgba(74, 222, 128, 0.45)"
                    : "rgba(22, 163, 74, 0.32)",
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.footerBtnText, { color: accents.green }]}>
                Apply Filters
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  backdropFill: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: "86%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingTop: 10,
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingBottom: 8,
  },
  section: {
    marginBottom: 18,
    gap: 10,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sectionTrailing: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12.5,
  },
  amountInputsRow: {
    flexDirection: "row",
    gap: 12,
  },
  amountInputCol: {
    flex: 1,
    gap: 5,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});
