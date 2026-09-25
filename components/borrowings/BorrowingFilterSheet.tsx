import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ACCOUNT_GREEN,
  accountAccent,
} from "@/components/accounts/accountScreenTheme";
import { Modal } from "@/components/common";
import { Button } from "@/components/ui/Button";
import {
  BORROWING_DATE_FILTERS,
  BORROWING_INTEREST_FILTERS,
  BORROWING_LENDER_FILTERS,
  BORROWING_STATUS_FILTERS,
  FilterChip,
} from "@/components/borrowings/BorrowingFilters";
import { haptic } from "@/lib/haptics";
import {
  EMPTY_BORROWING_FILTERS,
  countActiveBorrowingFilters,
  type BorrowingFilterState,
} from "@/shared/utils/borrowingFilters";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * Borrowings filter sheet (SPENDLY-139).
 *
 * Replaces three stacked rows of scrolling chips that competed with the list
 * for vertical space. Deliberately its own sheet rather than a generalisation
 * of the Journal's `AccountActivityFilterModal`: that one is typed to
 * transaction filters and has no room for a lender or interest dimension, so
 * sharing it would mean reworking the Journal's shipped filtering from here.
 *
 * Edits land on a draft and only reach the caller on Apply, so dismissing the
 * sheet discards rather than half-applying.
 */
export function BorrowingFilterSheet({
  visible,
  filters,
  onClose,
  onApply,
  getResultCount,
}: {
  visible: boolean;
  filters: BorrowingFilterState;
  onClose: () => void;
  onApply: (filters: BorrowingFilterState) => void;
  getResultCount: (filters: BorrowingFilterState) => number;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const [draft, setDraft] = useState<BorrowingFilterState>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const resultCount = getResultCount(draft);
  const activeCount = countActiveBorrowingFilters(draft);

  return (
    <Modal isOpen={visible} onClose={onClose} title="Filter borrowings" maxHeight="88%">
      <View style={styles.sections}>
        <Section label="Status">
          {BORROWING_STATUS_FILTERS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={draft.status === option.id}
              onPress={() => setDraft((prev) => ({ ...prev, status: option.id }))}
            />
          ))}
        </Section>

        <Section label="Lender type">
          {BORROWING_LENDER_FILTERS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={draft.lenderType === option.id}
              onPress={() => setDraft((prev) => ({ ...prev, lenderType: option.id }))}
            />
          ))}
        </Section>

        <Section label="Date range">
          {BORROWING_DATE_FILTERS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={draft.date === option.id}
              onPress={() => setDraft((prev) => ({ ...prev, date: option.id }))}
            />
          ))}
        </Section>

        <Section label="Interest type">
          {BORROWING_INTEREST_FILTERS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={draft.interest === option.id}
              onPress={() => setDraft((prev) => ({ ...prev, interest: option.id }))}
            />
          ))}
        </Section>
      </View>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Button
          variant="outline"
          size="sm"
          haptic={false}
          onPress={() => {
            void haptic.selection();
            setDraft(EMPTY_BORROWING_FILTERS);
          }}
          disabled={activeCount === 0}
          accessibilityLabel="Reset all borrowing filters"
          style={styles.resetBtn}
        >
          <Text style={[styles.resetLabel, { color: theme.colors.mutedForeground }]}>
            Reset
          </Text>
        </Button>

        <Pressable
          onPress={() => {
            void haptic.selection();
            onApply(draft);
          }}
          style={({ pressed }) => [
            styles.applyBtn,
            {
              backgroundColor: isDark ? ACCOUNT_GREEN : accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Show ${resultCount} matching borrowings`}
        >
          <Text style={styles.applyLabel}>
            {resultCount === 1 ? "Show 1 borrowing" : `Show ${resultCount} borrowings`}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <View style={styles.sectionChips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: 20,
    paddingBottom: 16,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  resetLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  applyBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  applyLabel: {
    color: "#052E16",
    fontSize: 15,
    fontWeight: "800",
  },
});
