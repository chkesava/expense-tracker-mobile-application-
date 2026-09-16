import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar, MetaLabel, useGaneshTokens } from "@/components/ganesh/ui";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useHouseholds } from "@/hooks/useHouseholds";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export type PickedProvider = {
  id: string;
  name: string;
  mobile?: string;
  source: "member" | "household";
};

const MAX_RESULTS = 6;

/**
 * Optional link to someone the pandal already knows.
 *
 * Deliberately a suggestion list rather than a required picker: walk-in
 * devotees are the common case, and a provider who must be selected from a list
 * would make the fast path the slow one. Picking someone links the entry *and*
 * fills the name; not picking anyone is a complete, valid entry.
 */
export function PrasadamProviderPicker({
  search,
  onPick,
}: {
  search: string;
  onPick: (provider: PickedProvider) => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { pandalId, festivalId } = useGaneshSession();
  const { households } = useHouseholds(pandalId, festivalId);
  const { members } = useFestivalMembers(pandalId, festivalId);

  const needle = search.trim().toLowerCase();

  const results = useMemo(() => {
    if (needle.length < 2) return [];
    const out: PickedProvider[] = [];
    for (const household of households) {
      if (household.name?.toLowerCase().includes(needle)) {
        out.push({
          id: household.id,
          name: household.name,
          mobile: household.mobile,
          source: "household",
        });
      }
    }
    for (const member of members) {
      if (member.displayName?.toLowerCase().includes(needle)) {
        out.push({ id: member.id, name: member.displayName, source: "member" });
      }
    }
    // An exact name match from both lists is one person to the committee, so
    // the first hit wins rather than showing the same name twice.
    const seen = new Set<string>();
    return out
      .filter((item) => {
        const key = item.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_RESULTS);
  }, [needle, households, members]);

  if (results.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <MetaLabel>Someone the pandal already knows?</MetaLabel>
      {results.map((item) => (
        <Pressable
          key={`${item.source}:${item.id}`}
          onPress={() => onPick(item)}
          accessibilityRole="button"
          accessibilityLabel={`Link to ${item.name}`}
          style={[styles.row, { backgroundColor: g.tile }]}
        >
          <Avatar name={item.name} size={32} seed={item.id} />
          <View style={styles.text}>
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }}
            >
              {item.name}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              {item.source === "household" ? "Household" : "Committee"}
              {item.mobile ? ` · ${item.mobile}` : ""}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 8,
    minHeight: 48,
  },
  text: { flex: 1, gap: 1 },
});
