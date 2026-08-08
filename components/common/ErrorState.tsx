import { StyleSheet, Text, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";

export type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
}: ErrorStateProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { padding: theme.space.xl, gap: theme.space.sm }]}>
      <AlertCircle size={theme.iconSize.xl} color={theme.colors.destructive} strokeWidth={1.75} />
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: theme.typography.lg,
          fontFamily: theme.fontFamily.bold,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            fontFamily: theme.fontFamily.regular,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          {description}
        </Text>
      ) : null}
      {onRetry ? (
        <Button variant="destructive" size="sm" onPress={onRetry} style={{ marginTop: theme.space.md }}>
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
