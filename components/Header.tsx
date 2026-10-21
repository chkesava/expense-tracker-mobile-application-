import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  APP_BAR_CONTENT_HEIGHT,
  APP_BAR_HORIZONTAL_PADDING,
} from "@/components/layout/chrome";
import { AppBarActions } from "@/components/layout/AppBarActions";
import { AppBarBrand } from "@/components/layout/AppBarBrand";
import { MonthDrawer } from "@/components/MonthDrawer";
import { SideDrawer } from "@/components/SideDrawer";
import { ownsAppBar } from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function Header() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      {/* Account detail and the dashboard (SPENDLY-566) draw their own bar. */}
      {ownsAppBar(pathname) ? null : (
        <View
          style={[
            styles.container,
            {
              paddingTop: insets.top,
              backgroundColor: isDark ? theme.colors.background : theme.colors.card,
              borderBottomColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.content}>
            <AppBarBrand />
            <AppBarActions onOpenProfile={() => setIsDrawerOpen(true)} />
          </View>
        </View>
      )}

      <MonthDrawer />
      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}

export default Header;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  content: {
    height: APP_BAR_CONTENT_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: APP_BAR_HORIZONTAL_PADDING,
  },
});
