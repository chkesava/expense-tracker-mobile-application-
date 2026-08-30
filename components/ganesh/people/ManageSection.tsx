import { type ReactNode } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";

import { AdminGlyph } from "@/components/ganesh/admin/adminArt";

import { PeopleGoldDivider } from "@/components/ganesh/people/PeopleGoldDivider";
import { PEOPLE_ART } from "@/components/ganesh/people/peopleArt";
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
 * Grouped destinations for the people who run the Pandal. Rows are passed in
 * so permission filtering stays on the screen.
 */
export function ManageSection({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
      <View style={styles.heading}>
        <AdminGlyph name="iconSettings" size={30} />
        <Text
          style={[
            styles.title,
            { color: theme.colors.foreground, fontFamily: TITLE_FONT ?? theme.fontFamily.semibold },
          ]}
        >
          Manage
        </Text>
      </View>
      <PeopleGoldDivider maxWidth={188} />
      {children}
      <Image
        source={PEOPLE_ART.lotusFooter}
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
  footer: {
    alignSelf: "center",
    width: 132,
    height: 22,
    marginTop: 4,
    opacity: 0.7,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  },
});
