import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/Button";
import type { LoadFailure } from "@/lib/firestoreErrors";
import { useTheme } from "@/theme/ThemeProvider";

export function AdminQueryState({
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  loading?: boolean;
  error?: LoadFailure | null;
  onRetry?: () => void;
  empty?: { title: string; description?: string } | null;
  children?: ReactNode;
}) {
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 24, gap: 10 }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ color: theme.colors.mutedForeground }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Couldn’t load this screen
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          {error.message}
        </Text>
        {error.retryable && onRetry ? (
          <Button variant="outline" onPress={onRetry}>
            Try again
          </Button>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return (
      <EmptyState compact title={empty.title} description={empty.description} />
    );
  }

  return <>{children}</>;
}
