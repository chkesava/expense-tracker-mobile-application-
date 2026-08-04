import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";

export default function NotFoundScreen() {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View
        style={[
          styles.container,
          { backgroundColor: theme.colors.background, padding: theme.space.xl },
        ]}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.typography.xl,
            fontWeight: "800",
            marginBottom: theme.space.lg,
          }}
        >
          Screen not found
        </Text>
        <Link href="/" asChild>
          <Button>Go home</Button>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
