import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { Input } from "@/components/ui/Input";
import type { Institution } from "@/shared/data/institutions";
import {
  getInstitutionById,
  searchInstitutions,
} from "@/shared/data/institutions";
import { useTheme } from "@/theme/ThemeProvider";

type InstitutionSearchFieldProps = {
  selectedId?: string;
  onSelect: (institution: Institution | null) => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
};

export function InstitutionSearchField({
  selectedId,
  onSelect,
  required = false,
  disabled = false,
  label = "Search Institution",
}: InstitutionSearchFieldProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const selected = getInstitutionById(selectedId);
  const results = useMemo(() => searchInstitutions(query), [query]);
  const showResults = !disabled && !selected && (focused || query.trim().length > 0);

  if (selected) {
    return (
      <View style={styles.wrap}>
        <Text
          style={[
            styles.label,
            { color: theme.colors.foreground, fontSize: theme.typography.sm },
          ]}
        >
          Selected Institution
        </Text>
        <View
          style={[
            styles.selectedRow,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.primary,
            },
          ]}
        >
          <Text
            style={[styles.selectedName, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {selected.name}
          </Text>
          <Pressable
            onPress={() => {
              onSelect(null);
              setQuery("");
              setFocused(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Change institution"
            hitSlop={8}
            style={styles.clearBtn}
          >
            <X size={16} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Input
        label={required ? `${label} *` : label}
        value={query}
        onChangeText={setQuery}
        placeholder={
          disabled
            ? "Select an account type first"
            : "e.g. Super Money, HDFC, SBI"
        }
        editable={!disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setTimeout(() => setFocused(false), 200);
        }}
        leadingIcon={
          <Search size={16} color={theme.colors.mutedForeground} />
        }
        helperText={
          required
            ? "Pick an exact institution from the list. Custom names are not allowed."
            : undefined
        }
      />
      {showResults ? (
        <View
          style={[
            styles.results,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.resultsScroll}
          >
            {results.length === 0 ? (
              <Text
                style={[
                  styles.empty,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                No matching institutions
              </Text>
            ) : (
              results.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onSelect(item);
                    setQuery("");
                    setFocused(false);
                  }}
                  style={({ pressed }) => [
                    styles.resultRow,
                    {
                      borderBottomColor: theme.colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.name}`}
                >
                  <Text
                    style={[
                      styles.resultName,
                      { color: theme.colors.foreground },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 6,
  },
  label: {
    fontWeight: "700",
  },
  selectedRow: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  clearBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  results: {
    maxHeight: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  resultsScroll: {
    maxHeight: 220,
  },
  resultRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: {
    fontSize: 15,
    fontWeight: "600",
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 13,
  },
});
