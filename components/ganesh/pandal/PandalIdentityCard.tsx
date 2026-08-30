import { StyleSheet, Text, View } from "react-native";
import { Calendar, ShieldCheck, Users } from "lucide-react-native";

import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { formatFestivalWindow } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Who this Pandal is. Values are live. Ganesha is identity only —
 * no money appears here.
 */
export function PandalIdentityCard({
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
  const { ganesha } = useArtScale();
  const window = formatFestivalWindow(festival);
  const open = festival?.status !== "closed";
  const committeeCopy =
    committeeSize === 1 ? "1 committee member" : `${committeeSize} committee members`;
  const statusCopy = open ? "Festival open" : "Festival closed";
  const statusColor = open ? g.godFund : theme.colors.mutedForeground;

  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}
      accessibilityLabel={[
        code ? `Pandal code ${code}` : "Your Pandal",
        pandalName,
        festivalName,
        committeeCopy,
        statusCopy,
        roleLabel ? `You are ${roleLabel}` : undefined,
      ]
        .filter(Boolean)
        .join(". ")}
    >
      <View pointerEvents="none" style={styles.ganeshaWrap}>
        <GaneshArt name="ganesha" width={ganesha * 1.55} height={ganesha * 1.55} opacity={0.62} />
      </View>

      {code ? (
        <Text
          numberOfLines={1}
          style={[styles.code, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}
        >
          {`Pandal code  ${code}`}
        </Text>
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.code, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}
        >
          Your Pandal
        </Text>
      )}

      <Text
        numberOfLines={2}
        style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
      >
        {pandalName || "Pandal"}
      </Text>

      <Text
        numberOfLines={2}
        style={[styles.festival, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
      >
        {festivalName || "Ganesh Utsav"}
        {window ? `  ·  ${window}` : ""}
      </Text>

      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: g.wash(g.saffron) }]}>
          <Users size={13} color={g.saffron} strokeWidth={2.2} />
          <Text style={[styles.chipText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
            {committeeCopy}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: g.wash(statusColor) }]}>
          <Calendar size={13} color={statusColor} strokeWidth={2.2} />
          <Text style={[styles.chipText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
            {statusCopy}
          </Text>
        </View>
        {roleLabel ? (
          <View style={[styles.chip, { backgroundColor: g.wash(g.personal) }]}>
            <ShieldCheck size={13} color={g.personal} strokeWidth={2.2} />
            <Text style={[styles.chipText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
              You are {roleLabel}
            </Text>
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 14,
    overflow: "hidden",
    boxShadow: "0 6px 18px rgba(122, 24, 54, 0.08)",
  },
  ganeshaWrap: {
    position: "absolute",
    right: -4,
    bottom: -6,
  },
  code: {
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    paddingRight: 72,
  },
  name: {
    fontSize: 24,
    letterSpacing: -0.5,
    marginTop: 6,
    paddingRight: 64,
  },
  festival: {
    fontSize: 14,
    marginTop: 4,
    paddingRight: 56,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    paddingRight: 72,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: GANESH_RADIUS.pill,
    borderCurve: "continuous",
  },
  chipText: {
    fontSize: 12,
  },
});
