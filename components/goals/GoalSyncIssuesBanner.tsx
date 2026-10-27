import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CloudOff } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useGoalSyncIssues } from "@/hooks/useGoalSyncIssues";
import { goalSyncIssues } from "@/lib/goalSyncIssues";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

/**
 * SPENDLY-613 — goal changes that failed after being shown as saved/queued,
 * with what happened and a recoverable action: Retry (same change, same
 * idempotency key, applied to the latest goal) or Dismiss. Nothing is dropped
 * silently. Announced to screen readers.
 */
export function GoalSyncIssuesBanner({ goalId }: { goalId?: string }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const issues = useGoalSyncIssues(goalId);
  const [busy, setBusy] = useState<string | null>(null);
  if (issues.length === 0) return null;

  return (
    <View style={{ gap: theme.space.sm }} accessibilityLiveRegion="assertive">
      {issues.map((issue) => (
        <View
          key={issue.id}
          style={[styles.card, { backgroundColor: surfaces.wash(theme.colors.destructive), borderRadius: theme.radius.md }]}
          accessibilityRole="alert"
        >
          <View style={styles.row}>
            <CloudOff size={16} color={theme.colors.destructive} />
            <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              A {issue.label} wasn't saved
            </Text>
          </View>
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{issue.message}</Text>
          <View style={styles.row}>
            {issue.retry ? (
              <Button
                variant="primary"
                size="sm"
                loading={busy === issue.id}
                disabled={busy !== null}
                onPress={async () => {
                  setBusy(issue.id);
                  try {
                    await goalSyncIssues.retry(issue.id);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Retry
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" disabled={busy !== null} onPress={() => goalSyncIssues.dismiss(issue.id)} accessibilityLabel={`Dismiss: ${issue.label} not saved`}>
              Dismiss
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 14 },
});
