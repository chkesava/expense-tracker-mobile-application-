import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens } from "./tokens";

export type GaneshHeaderProps = {
  title: string;
  /** Uppercase tracked line under the title — pandal or festival name. */
  subtitle?: string;
  /** Optional 48dp tinted glyph tile, matching the Expense Tracker's PageHeader. */
  icon?: ReactNode;
  onBack?: () => void;
  rightElement?: ReactNode;
};

/**
 * Screen header for Ganesh Seva. Deliberately identical in metrics to
 * `components/layout/PageHeader` (24px/-0.5 title, 48dp icon tile, uppercase
 * tracked subtitle) so the two apps read as one product — only the glyph tint
 * carries the festival identity.
 */
export function GaneshHeader({
  title,
  subtitle,
  icon,
  onBack,
  rightElement,
}: GaneshHeaderProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={() => {
            void haptic.selection();
            onBack();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.8 }]}
        >
          <ArrowLeft size={22} color={theme.colors.foreground} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <View style={styles.left}>
        {icon ? (
          <View
            style={[
              styles.iconTile,
              { backgroundColor: g.wash(g.saffron), borderColor: g.wash(g.saffron) },
            ]}
          >
            {icon}
          </View>
        ) : null}

        <View style={styles.textCol}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginTop: 2,
  },
  right: {
    marginLeft: 8,
    alignItems: "flex-end",
  },
});
