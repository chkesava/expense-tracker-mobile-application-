import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu } from "lucide-react-native";

import { ACTION_DOCK_EDGE, actionDockOffset } from "@/components/layout/chrome";
import { haptic } from "@/lib/haptics";
import { SideDrawer } from "@/components/SideDrawer";
import { AddFab } from "@/components/ui/AddFab";
import { useModals } from "@/providers/ModalProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function MobileActionDock() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { setIsAddSheetOpen } = useModals();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const handleOpenMenu = () => {
    void haptic.navigation();
    setIsMenuOpen(true);
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.container,
          {
            // Shared with the clearance lists pad by, so the dock's FAB always
            // floats above the last row rather than over it (SPENDLY-141).
            bottom: actionDockOffset(insets.bottom),
          },
        ]}
      >
        {/* Center Big Add FAB */}
        <View style={styles.centerFab}>
          <AddFab
            size="lg"
            onPress={() => setIsAddSheetOpen(true)}
            accessibilityLabel="Add"
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
    paddingHorizontal: ACTION_DOCK_EDGE,
    zIndex: 90,
  },
  centerFab: {
    alignItems: "center",
    justifyContent: "center",
  },
  menuButton: {
    position: "absolute",
    right: ACTION_DOCK_EDGE,
    width: 52,
    height: 52,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
