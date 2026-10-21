import { memo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";

import { useSurfaces } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The amount-privacy (ghost mode) switch. It used to sit in the dashboard
 * greeting (SPENDLY-532); SPENDLY-566 moves it next to the net-worth figure,
 * as in the Visual First reference. Same setting, same behaviour.
 */
export const PrivacyToggle = memo(function PrivacyToggle() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings, setGhostMode } = useSettings();
  const hidden = Boolean(settings.ghostMode);

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        setGhostMode(!hidden);
      }}
      hitSlop={8}
      android_ripple={{ color: surfaces.control, borderless: true }}
      style={({ pressed }) => [
        styles.privacy,
        {
          backgroundColor: hidden ? surfaces.wash(theme.colors.primary) : surfaces.control,
          borderColor: hidden ? theme.colors.primary : theme.colors.border,
        },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: hidden }}
      accessibilityLabel={hidden ? "Show amounts" : "Hide amounts"}
    >
      {hidden ? (
        <EyeOff size={17} color={theme.colors.primary} strokeWidth={2.2} />
      ) : (
        <Eye size={17} color={theme.colors.foreground} strokeWidth={2.2} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  privacy: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
