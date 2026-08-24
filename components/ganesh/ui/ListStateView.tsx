import { View } from "react-native";

import { EmptyState, type EmptyActionConfig } from "@/components/common/EmptyState";
import { type EmptyIllustrationType } from "@/components/common/EmptyStateIllustration";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonList } from "@/components/common/Skeleton";

export type ListStateViewProps = {
  loading?: boolean;
  /** Any load failure. `message` is shown when present. */
  error?: { message?: string } | null;
  onRetry?: () => void;
  title: string;
  description?: string;
  illustration?: EmptyIllustrationType;
  action?: EmptyActionConfig;
  /** Number of skeleton rows while loading. */
  skeletonCount?: number;
};

/**
 * The `ListEmptyComponent` for every Ganesh list.
 *
 * Ganesh screens previously rendered a bare "No X yet" line and nothing at all
 * while loading or on failure. This routes all three states through the shared
 * Expense Tracker components so a slow network shows skeletons, a failure is
 * actionable, and an empty list offers the action that fills it.
 */
export function ListStateView({
  loading,
  error,
  onRetry,
  title,
  description,
  illustration,
  action,
  skeletonCount = 4,
}: ListStateViewProps) {
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
        title="We couldn’t load this list"
        description={
          error.message ||
          "Please check your connection and try again. Anything you already added is safe."
        }
        onRetry={onRetry}
      />
    );
  }

  return (
    <EmptyState
      illustration={illustration}
      title={title}
      description={description}
      primaryAction={action}
    />
  );
}
