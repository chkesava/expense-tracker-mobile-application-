import type { ReactNode } from "react";

import { NavRow } from "@/components/ganesh/ui/NavRow";
import type { StatusKind } from "@/components/ganesh/ui/StatusBadge";

/**
 * Kept for call-site compatibility. The implementation is now `NavRow`, which
 * renders as a row inside a `Section` rather than as its own bordered card —
 * grouped navigation instead of a wall of cards.
 */
export function AdminLinkRow({
  title,
  subtitle,
  badge,
  tone = "normal",
  icon,
  divider,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: "normal" | "attention" | "critical";
  icon?: ReactNode;
  divider?: boolean;
  onPress: () => void;
}) {
  const kind: StatusKind = tone === "critical" ? "overdue" : "pending";

  return (
    <NavRow
      title={title}
      meta={subtitle}
      icon={icon}
      divider={divider}
      badge={badge ? { kind, label: badge } : undefined}
      onPress={onPress}
    />
  );
}
