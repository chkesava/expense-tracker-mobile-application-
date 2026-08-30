import type { ReactNode } from "react";
import { View } from "react-native";
import { Inbox } from "lucide-react-native";

import { GaneshEmptyState, useGaneshTokens } from "@/components/ganesh/ui";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonList } from "@/components/common/Skeleton";
import type { LoadFailure } from "@/lib/firestoreErrors";

/**
 * Loading / error / empty wrapper for the admin surfaces.
 *
 * Loading uses the shared skeleton. Empty uses GaneshEmptyState — never the
 * Expense Tracker's finance illustrations.
 */
export function AdminQueryState({
  loading,
  error,
  onRetry,
  empty,
  skeletonCount = 4,
  children,
}: {
  loading?: boolean;
  error?: LoadFailure | null;
  onRetry?: () => void;
  empty?: { title: string; description?: string } | null;
  skeletonCount?: number;
  children?: ReactNode;
}) {
  const g = useGaneshTokens();

  if (loading) {
    return (
      <View style={{ paddingTop: 4 }}>
        <SkeletonList count={skeletonCount} />
      </View>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="We couldn’t load this screen"
        description={error.message}
        onRetry={error.retryable ? onRetry : undefined}
      />
    );
  }

  if (empty) {
    return (
      <GaneshEmptyState
        compact
        icon={<Inbox size={20} color={g.saffron} strokeWidth={1.9} />}
        title={empty.title}
        description={empty.description}
      />
    );
  }

  return <>{children}</>;
}
