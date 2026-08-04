import { Text, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertTriangle } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

export function MaintenanceScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
            padding: theme.space.xl,
          },
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: theme.colors.warning + "33" },
          ]}
        >
          <AlertTriangle color={theme.colors.warning} size={36} />
        </View>
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.typography.xl,
            fontWeight: "800",
            textAlign: "center",
            marginBottom: theme.space.sm,
          }}
        >
          Under Maintenance
        </Text>
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          We are currently performing updates to improve your experience.
          We will be back shortly. Thank you for your patience.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
});
