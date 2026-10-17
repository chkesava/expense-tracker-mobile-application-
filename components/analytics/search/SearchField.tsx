import React from "react";

import { SearchBar } from "@/components/common/SearchBar";
import { useInsightAccents } from "@/components/analytics/insightsTheme";

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
  const accents = useInsightAccents();

  // SPENDLY-154: the shared SearchBar, with the theme accent as its focus ring.
  return (
    <SearchBar
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="search"
      autoCorrect={false}
      accessibilityLabel="Search transactions"
      accentColor={accents.accent}
    />
  );
}

