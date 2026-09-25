import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RotateCcw, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  accountAccent,
  accountAccentBorder,
} from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import type {
  AccountActivityFilterOptions,
  AccountActivityFilters,
  AccountActivitySpecialKind,
  AccountActivityStatus,
} from "@/shared/utils/accountActivityFilters";
import {
  createEmptyAccountActivityFilters,
  getAccountActivityFilterValidationError,
} from "@/shared/utils/accountActivityFilters";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
interface AccountActivityFilterModalProps {
  visible: boolean;
  filters: AccountActivityFilters;
  options: AccountActivityFilterOptions;
  onClose: () => void;
  onApply: (filters: AccountActivityFilters) => void;
  getResultCount: (filters: AccountActivityFilters) => number;
}

const SPECIAL_OPTIONS: Array<{
  id: AccountActivitySpecialKind;
  label: string;
}> = [
  { id: "refunds", label: "Refunds & cashback" },
  { id: "investments", label: "Investments" },
  { id: "bills", label: "Bills & payments" },
];

const STATUS_LABELS: Record<AccountActivityStatus, string> = {
  audited: "Audited",
  unaudited: "Not audited",
};

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function AccountActivityFilterModal({
  visible,
  filters,
  options,
  onClose,
  onApply,
  getResultCount,
}: AccountActivityFilterModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();
  const accent = accountAccent(isDark);
  const accentBorder = accountAccentBorder(isDark);
  const surface = isDark ? "#10141C" : theme.colors.card;
  const insetBorder = isDark
    ? "rgba(148,163,184,0.16)"
    : "rgba(15,23,42,0.09)";
  const [draft, setDraft] = useState<AccountActivityFilters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [filters, visible]);

  const validationError = getAccountActivityFilterValidationError(draft);
  const resultCount = useMemo(
    () => (validationError ? 0 : getResultCount(draft)),
    [draft, getResultCount, validationError]
  );

  const setArrayValue = <
    K extends
      | "specialKinds"
      | "categories"
      | "counterparties"
      | "accounts"
      | "tags"
      | "statuses",
  >(
    key: K,
    value: AccountActivityFilters[K][number]
  ) => {
    void haptic.selection();
    setDraft((previous) => ({
      ...previous,
      [key]: toggleValue(previous[key], value),
    }));
  };

  const renderChip = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <Chip
      key={key}
      label={label}
      selected={selected}
      appearance="tonal"
      accentColor={accent}
      onPress={onPress}
      accessibilityLabel={label}
    />
  );

  const renderSectionTitle = (title: string, selectionCount = 0) => (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
        {title}
      </Text>
      {selectionCount > 0 ? (
        <Text style={[styles.selectionCount, { color: accent }]}>
          {selectionCount} selected
        </Text>
      ) : null}
    </View>
  );

  const renderInput = (
    label: string,
    value: string,
    placeholder: string,
    onChangeText: (value: string) => void,
    keyboardType: "default" | "decimal-pad" = "default"
  ) => (
    <View style={styles.inputColumn}>
      <Text style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );

  const handleClear = () => {
    void haptic.warning();
    setDraft(createEmptyAccountActivityFilters());
  };

  const handleApply = () => {
    if (validationError) return;
    void haptic.selection();
    onApply(draft);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss transaction filters"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: surface,
              borderColor: theme.colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: insetBorder }]} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>
                Advanced filters
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                Combine criteria to narrow this account&apos;s activity
              </Text>
            </View>
            <Button
              variant="ghost"
              size="icon"
              onPress={onClose}
              accessibilityLabel="Close filters"
              hitSlop={12}
              style={styles.closeButton}
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Button>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              {renderSectionTitle("ACTIVITY TYPE", draft.specialKinds.length)}
              <View style={styles.chipRow}>
                {SPECIAL_OPTIONS.map((option) =>
                  renderChip(
                    option.id,
                    option.label,
                    draft.specialKinds.includes(option.id),
                    () => setArrayValue("specialKinds", option.id)
                  )
                )}
              </View>
            </View>

            <View style={styles.section}>
              {renderSectionTitle("DATE RANGE")}
              <View style={styles.inputRow}>
                {renderInput("From", draft.fromDate, "YYYY-MM-DD", (fromDate) =>
                  setDraft((previous) => ({ ...previous, fromDate }))
                )}
                {renderInput("To", draft.toDate, "YYYY-MM-DD", (toDate) =>
                  setDraft((previous) => ({ ...previous, toDate }))
                )}
              </View>
            </View>

            <View style={styles.section}>
              {renderSectionTitle("AMOUNT RANGE")}
              <View style={styles.inputRow}>
                {renderInput(
                  "Minimum",
                  draft.minAmount,
                  "0",
                  (minAmount) =>
                    setDraft((previous) => ({ ...previous, minAmount })),
                  "decimal-pad"
                )}
                {renderInput(
                  "Maximum",
                  draft.maxAmount,
                  "No limit",
                  (maxAmount) =>
                    setDraft((previous) => ({ ...previous, maxAmount })),
                  "decimal-pad"
                )}
              </View>
            </View>

            {options.categories.length > 0 ? (
              <View style={styles.section}>
                {renderSectionTitle("CATEGORIES", draft.categories.length)}
                <View style={styles.chipRow}>
                  {options.categories.map((category) =>
                    renderChip(
                      `category-${category}`,
                      category,
                      draft.categories.includes(category),
                      () => setArrayValue("categories", category)
                    )
                  )}
                </View>
              </View>
            ) : null}

            {options.counterparties.length > 0 ? (
              <View style={styles.section}>
                {renderSectionTitle(
                  "COUNTERPARTIES",
                  draft.counterparties.length
                )}
                <View style={styles.chipRow}>
                  {options.counterparties.map((counterparty) =>
                    renderChip(
                      `counterparty-${counterparty}`,
                      counterparty,
                      draft.counterparties.includes(counterparty),
                      () => setArrayValue("counterparties", counterparty)
                    )
                  )}
                </View>
              </View>
            ) : null}

            {options.accounts.length > 0 ? (
              <View style={styles.section}>
                {renderSectionTitle("ACCOUNTS", draft.accounts.length)}
                <View style={styles.chipRow}>
                  {options.accounts.map((account) =>
                    renderChip(
                      `account-${account}`,
                      account,
                      draft.accounts.includes(account),
                      () => setArrayValue("accounts", account)
                    )
                  )}
                </View>
              </View>
            ) : null}

            {options.tags.length > 0 ? (
              <View style={styles.section}>
                {renderSectionTitle("TAGS", draft.tags.length)}
                <View style={styles.chipRow}>
                  {options.tags.map((tag) =>
                    renderChip(
                      `tag-${tag}`,
                      tag,
                      draft.tags.includes(tag),
                      () => setArrayValue("tags", tag)
                    )
                  )}
                </View>
              </View>
            ) : null}

            {options.statuses.length > 0 ? (
              <View style={styles.section}>
                {renderSectionTitle("STATUS", draft.statuses.length)}
                <View style={styles.chipRow}>
                  {options.statuses.map((status) =>
                    renderChip(
                      `status-${status}`,
                      STATUS_LABELS[status],
                      draft.statuses.includes(status),
                      () => setArrayValue("statuses", status)
                    )
                  )}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {validationError ? (
            <Text style={styles.validationError} accessibilityRole="alert">
              {validationError}
            </Text>
          ) : null}

          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              variant="outline"
              size="sm"
              onPress={handleClear}
              accessibilityLabel="Clear all transaction filters"
              style={styles.footerButton}
            >
              <RotateCcw size={16} color={theme.colors.foreground} />
              <Text style={[styles.footerText, { color: theme.colors.foreground }]}>
                Clear all
              </Text>
            </Button>
            <Pressable
              onPress={handleApply}
              disabled={Boolean(validationError)}
              accessibilityRole="button"
              accessibilityLabel={
                validationError
                  ? `Cannot apply filters. ${validationError}`
                  : `Show ${resultCount} matching activities`
              }
              style={({ pressed }) => [
                styles.footerButton,
                {
                  backgroundColor: isDark
                    ? "rgba(74,222,128,0.16)"
                    : "rgba(22,163,74,0.12)",
                  borderColor: accentBorder,
                  opacity: validationError ? 0.45 : pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.footerText, { color: accent }]}>
                Show {resultCount}
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
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    maxHeight: "88%",
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
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerCopy: {
    flex: 1,
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingBottom: 8,
  },
  section: {
    gap: 10,
    marginBottom: 18,
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  selectionCount: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipText: {
    fontSize: 12.5,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputColumn: {
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
  validationError: {
    color: "#F87171",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  footerText: {
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});
