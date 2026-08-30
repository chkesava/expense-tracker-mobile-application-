import { type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { PeopleGoldDivider } from "@/components/ganesh/people/PeopleGoldDivider";
import { useGaneshTokens } from "@/components/ganesh/ui";
import { GANESH_RADIUS } from "@/components/ganesh/ui/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

/**
 * Grouped destinations on the Pandal tab. Footer lotus is optional so the
 * identity card and account bar stay quieter.
 */
export function PandalSectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: boolean;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
      <View style={styles.heading}>
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
            numberOfLines={2}
            style={[styles.subtitle, { color: g.saffron, fontFamily: theme.fontFamily.medium }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <PeopleGoldDivider maxWidth={188} />
      {children}
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
  },
  heading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
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
});
