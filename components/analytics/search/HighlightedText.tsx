import React, { useMemo } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

export interface HighlightedTextProps {
  text: string;
  /** Already-trimmed search term; empty means render plain text. */
  query: string;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * Renders `text` with every case-insensitive occurrence of `query` emphasised.
 * Purely presentational — matching itself stays in the search filter.
 */
export function HighlightedText({
  text,
  query,
  style,
  highlightStyle,
  numberOfLines,
}: HighlightedTextProps) {
  const segments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;

    const haystack = text.toLowerCase();
    const parts: { value: string; match: boolean }[] = [];
    let cursor = 0;

    for (;;) {
      const hit = haystack.indexOf(needle, cursor);
      if (hit === -1) break;
      if (hit > cursor) {
        parts.push({ value: text.slice(cursor, hit), match: false });
      }
      parts.push({ value: text.slice(hit, hit + needle.length), match: true });
      cursor = hit + needle.length;
    }

    if (parts.length === 0) return null;
    if (cursor < text.length) {
      parts.push({ value: text.slice(cursor), match: false });
    }
    return parts;
  }, [text, query]);

  if (!segments) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, index) =>
        segment.match ? (
          <Text key={index} style={highlightStyle}>
            {segment.value}
          </Text>
        ) : (
          segment.value
        )
      )}
    </Text>
  );
}
