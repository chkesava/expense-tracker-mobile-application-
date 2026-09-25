import React from "react";

import { SearchBar } from "@/components/common/SearchBar";
import { insightAccents } from "@/components/analytics/insightsTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}

/** The primary control on Search & Lab — large target, clear focus accent. */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search by note, category, tag, account or amount...",
}: SearchFieldProps) {
  const { themeName } = useTheme();
  const accents = insightAccents(themeUsesDarkPalette(themeName));

  // SPENDLY-154: the shared SearchBar, keeping the Insights pink focus ring.
  return (
    <SearchBar
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="search"
      autoCorrect={false}
      accessibilityLabel="Search transactions"
      accentColor={accents.pink}
    />
  );
}

