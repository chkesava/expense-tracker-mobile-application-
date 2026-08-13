/**
 * Spending Spaces.
 *
 * A Space is a lightweight grouping label for expenses ("Brother's Hospital",
 * "Home Renovation"). It never creates or duplicates transactions: an expense
 * simply carries an optional `spaceId`. Spaces are unrelated to Borrowings.
 */

export const SPACE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export type SpaceStatus = (typeof SPACE_STATUSES)[number];

export const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

/** Preset colors so a Space is recognisable at a glance. */
export const SPACE_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#EF4444",
  "#6B7280",
] as const;

export interface Space {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  /** Hex color used by the list and detail header. */
  color?: string;
  icon?: string;
  /** Optional spending cap. Informational only, never blocks an expense. */
  budget?: number | null;
  /** YYYY-MM-DD */
  startDate?: string | null;
  /** YYYY-MM-DD */
  endDate?: string | null;
  status: SpaceStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}
