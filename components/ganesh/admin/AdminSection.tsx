import { type ReactNode } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";

import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

import { ADMIN_ART } from "./adminArt";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * Grouped Admin destinations. Heading glyph + gold lotus rule + footer —
 * same card language as People / Pandal.
 */
export function AdminSection({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
      <View style={styles.heading}>
        <View style={styles.headingGlyph}>{icon}</View>
        <Text
          style={[
            styles.title,
            { color: theme.colors.foreground, fontFamily: TITLE_FONT ?? theme.fontFamily.semibold },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[styles.subtitle, { color: g.saffron, fontFamily: theme.fontFamily.medium }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Image
        source={ADMIN_ART.goldDivider}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={styles.divider}
      />
      {children}
      <Image
        source={ADMIN_ART.lotusFooter}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={styles.footer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: GANESH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    boxShadow: "0 6px 18px rgba(122, 24, 54, 0.08)",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  headingGlyph: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    letterSpacing: -0.2,
    flexShrink: 0,
  },
  subtitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    textAlign: "right",
  },
  divider: {
    alignSelf: "center",
    width: 188,
    height: 22,
    marginVertical: 4,
  },
  footer: {
    alignSelf: "center",
    width: 132,
    height: 22,
    marginTop: 4,
    opacity: 0.7,
  },
});
