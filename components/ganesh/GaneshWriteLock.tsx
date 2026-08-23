import { Text } from "react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { useTheme } from "@/theme/ThemeProvider";

export function GaneshWriteLock({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Not allowed
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>{message}</Text>
    </GaneshScreen>
  );
}
