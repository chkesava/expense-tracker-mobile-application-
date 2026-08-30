import { type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { FestivalGarlandBells } from "@/components/ganesh/art/FestivalChrome";
import { GaneshArt } from "@/components/ganesh/art/GaneshArt";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { FESTIVAL_CHROME_ART } from "@/components/ganesh/chrome/festivalArt";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { ADMIN_ART } from "./adminArt";

const TITLE_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: 'Georgia, "Times New Roman", serif',
  default: undefined,
});

const INK = "#FFF8F1";
const GOLD = "#E8C36A";

/**
 * Admin identity. Authoritative maroon chrome — live Pandal and festival,
 * never poster copy.
 */
export function AdminHero({
  pandalName,
  festivalName,
  onBack,
  rightAccessory,
}: {
  pandalName?: string;
  festivalName?: string;
  onBack: () => void;
  rightAccessory?: ReactNode;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const { temple, mandala } = useArtScale();
  const maroon = g.isDark ? "#3A1020" : "#7A1836";

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: maroon,
          paddingTop: insets.top + 6,
          experimental_backgroundImage: g.isDark
            ? "linear-gradient(180deg, #4A1628 0%, #3A1020 88%)"
            : "linear-gradient(180deg, #9B2C4A 0%, #7A1836 62%, #64142C 100%)",
        },
      ]}
    >
      <View pointerEvents="none" style={styles.mandalaWrap}>
        <GaneshArt name="mandala" width={mandala * 0.88} height={mandala * 0.88} opacity={0.1} />
      </View>
      <View pointerEvents="none" style={styles.ganeshaWrap}>
        <GaneshArt name="ganesha" width={88} height={88} opacity={0.22} />
      </View>
      <FestivalGarlandBells />
      <View pointerEvents="none" style={styles.templeWrap}>
        <Image
          source={ADMIN_ART.temple}
          resizeMode="contain"
          style={{ width: temple * 0.78, height: temple * 0.78, opacity: 0.52 }}
        />
      </View>
      <View pointerEvents="none" style={styles.flagWrap}>
        <Image source={FESTIVAL_CHROME_ART.flag} resizeMode="contain" style={styles.flag} />
      </View>

      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            void haptic.selection();
            onBack();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backTile, pressed ? { opacity: 0.8 } : null]}
        >
          <ArrowLeft size={20} color="#7A1836" strokeWidth={2.4} />
        </Pressable>
        {rightAccessory ? <View style={styles.topRight}>{rightAccessory}</View> : null}
      </View>

      <View style={styles.row}>
        <Image
          source={ADMIN_ART.shield}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Admin"
          style={styles.shield}
        />
        <View style={styles.copy}>
          <Text
            style={[styles.title, { fontFamily: TITLE_FONT ?? theme.fontFamily.bold }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            Admin
          </Text>
          {pandalName ? (
            <Text
              style={[styles.pandal, { fontFamily: theme.fontFamily.semibold }]}
              numberOfLines={1}
            >
              {pandalName.toUpperCase()}
            </Text>
          ) : null}
          {festivalName ? (
            <Text
              style={[styles.festival, { fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              ✿  {festivalName}  ✿
            </Text>
          ) : null}
        </View>
      </View>

      <View pointerEvents="none" style={[styles.curveBite, { backgroundColor: theme.colors.background }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    overflow: "hidden",
    minHeight: 156,
  },
  mandalaWrap: {
    position: "absolute",
    left: -52,
    top: -18,
    zIndex: 0,
  },
  ganeshaWrap: {
    position: "absolute",
    left: 52,
    bottom: 28,
    zIndex: 1,
  },
  templeWrap: {
    position: "absolute",
    right: -12,
    bottom: 10,
    zIndex: 1,
  },
  flagWrap: {
    position: "absolute",
    right: 96,
    bottom: 34,
    zIndex: 2,
  },
  flag: {
    width: 34,
    height: 52,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    zIndex: 4,
  },
  backTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: INK,
    alignItems: "center",
    justifyContent: "center",
  },
  topRight: {
    alignItems: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 3,
    marginTop: 10,
    paddingRight: 92,
  },
  shield: {
    width: 52,
    height: 52,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: INK,
    fontSize: 30,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  pandal: {
    color: INK,
    fontSize: 12,
    letterSpacing: 1.1,
  },
  festival: {
    color: GOLD,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  curveBite: {
    position: "absolute",
    bottom: -1,
    left: -40,
    right: -40,
    height: 22,
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
  },
});
