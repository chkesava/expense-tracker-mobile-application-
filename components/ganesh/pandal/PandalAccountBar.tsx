import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LogOut, Repeat } from "lucide-react-native";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

import { GaneshAppVersion } from "@/components/ganesh/GaneshAppVersion";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { MetaLabel, useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Leave Ganesh Seva without looking like a festival action. Switch app stays
 * signed in; log out is the quieter, clearly destructive control.
 */
export function PandalAccountBar({
  onSwitchApp,
  onLogout,
}: {
  onSwitchApp: () => void;
  onLogout: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.heading,
          { color: theme.colors.foreground, fontFamily: TITLE_FONT ?? theme.fontFamily.semibold },
        ]}
      >
        Account
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            void haptic.selection();
            onSwitchApp();
          }}
          accessibilityRole="button"
          accessibilityLabel="Switch app"
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: theme.colors.card, borderColor: g.divider },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <View style={[styles.glyph, { backgroundColor: g.wash(g.saffron) }]}>
            <Repeat size={16} color={g.saffron} strokeWidth={2.2} />
          </View>
          <Text style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            Switch app
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void haptic.selection();
            onLogout();
          }}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: theme.colors.card, borderColor: g.divider },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <View style={[styles.glyph, { backgroundColor: g.tile }]}>
            <LogOut size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
          </View>
          <Text
            style={[styles.label, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}
          >
            Log out
          </Text>
        </Pressable>

        <GaneshArt name="diya" width={36} height={36} />
      </View>
      <MetaLabel>
        Switching apps keeps you signed in. Ganesh Seva and Expense Tracker never share data.
      </MetaLabel>
      <GaneshAppVersion />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  heading: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tile: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    flexShrink: 1,
  },
});
