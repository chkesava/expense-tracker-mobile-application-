import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, Info, WifiOff } from "lucide-react-native";

import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * A short, inline notice on tax screens (SPENDLY-290): the readiness
 * disclaimer, an incomplete year, offline, or a likely double count.
 */
export function TaxNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "offline";
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = tone === "warning" ? theme.colors.warning : theme.colors.mutedForeground;
  const Icon = tone === "warning" ? AlertTriangle : tone === "offline" ? WifiOff : Info;
  return (
    <View
      accessibilityLiveRegion={tone === "info" ? undefined : "polite"}
      style={[
        styles.row,
        {
          gap: theme.space.sm,
          padding: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: tone === "warning" ? withAlpha(theme.colors.warning, 0.1) : surfaces.tile,
        },
      ]}
    >
      <Icon size={16} color={color} style={styles.icon} />
      <Text style={{ flex: 1, color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs, lineHeight: 18 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  icon: { marginTop: 1 },
});
