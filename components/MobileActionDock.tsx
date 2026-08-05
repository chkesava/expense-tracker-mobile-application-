import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Menu } from "lucide-react-native";

import { SideDrawer } from "@/components/SideDrawer";
import { AddFab } from "@/components/ui/AddFab";
import { useModals } from "@/providers/ModalProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function MobileActionDock() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { setIsAddExpenseOpen } = useModals();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const handleOpenMenu = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setIsMenuOpen(true);
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.container,
          {
            bottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {/* Center Big Add FAB */}
        <View style={styles.centerFab}>
          <AddFab
            size="lg"
            onPress={() => setIsAddExpenseOpen(true)}
            accessibilityLabel="Add transaction"
          />
        </View>

        {/* Right Menu Button */}
        <Pressable
          onPress={handleOpenMenu}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          style={({ pressed }) => [
            styles.menuButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 10,
              elevation: 8,
            },
            pressed && { transform: [{ scale: 0.94 }], opacity: 0.8 },
          ]}
        >
          <Menu size={24} color={theme.colors.foreground} strokeWidth={2.2} />
        </Pressable>
      </View>

      <SideDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
}

export default MobileActionDock;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 90,
  },
  centerFab: {
    alignItems: "center",
    justifyContent: "center",
  },
  menuButton: {
    position: "absolute",
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
