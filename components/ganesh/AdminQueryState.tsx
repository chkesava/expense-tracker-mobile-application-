import type { ReactNode } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonList } from "@/components/common/Skeleton";
import type { LoadFailure } from "@/lib/firestoreErrors";

/**
 * Loading / error / empty wrapper for the admin surfaces.
 *
 * Routes all three states through the shared Expense Tracker components, so a
 * slow admin screen shows skeleton rows instead of an inline spinner and a
 * failure gets the standard retry treatment.
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
    return <EmptyState compact title={empty.title} description={empty.description} />;
  }

  return <>{children}</>;
}
