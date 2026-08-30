import { type ReactNode } from "react";
import { Inbox } from "lucide-react-native";
import { View } from "react-native";

import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonList } from "@/components/common/Skeleton";

import { GaneshEmptyState, type GaneshEmptyAction } from "./GaneshEmptyState";
import { useGaneshTokens } from "./tokens";

export type ListStateViewProps = {
  loading?: boolean;
  /** Any load failure. `message` is shown when present. */
  error?: { message?: string } | null;
  onRetry?: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  /**
   * @deprecated Expense Tracker illustration names are ignored. Kept so
   * existing call sites compile without a finance empty state leaking in.
   */
  illustration?: string;
  action?: GaneshEmptyAction;
  /** Number of skeleton rows while loading. */
  skeletonCount?: number;
};

/**
 * The `ListEmptyComponent` for every Ganesh list.
 *
 * Loading uses the shared skeleton. Empty uses `GaneshEmptyState` — never the
 * Expense Tracker's finance illustrations.
 */
export function ListStateView({
  loading,
  error,
  onRetry,
  title,
  description,
  icon,
  action,
  skeletonCount = 4,
}: ListStateViewProps) {
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
    <GaneshEmptyState
      icon={icon ?? <Inbox size={22} color={g.saffron} strokeWidth={1.9} />}
      title={title}
      description={description}
      action={action}
    />
  );
}
