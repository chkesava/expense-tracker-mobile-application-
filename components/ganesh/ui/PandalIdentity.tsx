import { StyleSheet, Text, View } from "react-native";

import { formatFestivalWindow } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

import { GANESH_RADIUS, useSurfaces } from "./surfaces";
import { useGaneshTokens } from "./tokens";

/**
 * The Pandal tab's identity card.
 *
 * No arch — that decoration belongs on the Command Center hero only.
 * No money — the Pandal tab is about who we are and what we own, not
 * the festival cash position (that lives on Funds).
 */
export function PandalIdentity({
  pandalName,
  code,
  festivalName,
  festival,
  committeeSize,
  roleLabel,
}: {
  pandalName?: string;
  code?: string;
  festivalName?: string;
  festival?: { startDate?: string; endDate?: string; status?: string } | null;
  committeeSize: number;
  roleLabel?: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();
  const window = formatFestivalWindow(festival);
  const open = festival?.status !== "closed";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: surfaces.divider },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.eyebrow, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}
      >
        {code ? `Code ${code}` : "Your Pandal"}
      </Text>

      <Text
        numberOfLines={2}
        style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
      >
        {pandalName || "Pandal"}
      </Text>

      <Text
        numberOfLines={1}
        style={[styles.festival, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
      >
        {festivalName || "Ganesh Utsav"}
        {window ? ` · ${window}` : ""}
      </Text>

      <View style={styles.meta}>
        <Text
          style={[styles.metaText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
        >
          {committeeSize} {committeeSize === 1 ? "committee member" : "committee members"}
        </Text>
        <Text
          style={[
            styles.metaText,
            { color: open ? theme.colors.foreground : theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
          ]}
        >
          {open ? "Festival open" : "Festival closed"}
        </Text>
        {roleLabel ? (
          <Text
            style={[styles.metaText, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
          >
            You are {roleLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 4,
  },
  eyebrow: {
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 25,
    letterSpacing: -0.6,
    marginTop: 2,
  },
  festival: {
    fontSize: 14,
    letterSpacing: -0.15,
    marginTop: 4,
  },
  meta: {
    marginTop: 12,
    gap: 3,
  },
  metaText: {
    fontSize: 13,
  },
});
