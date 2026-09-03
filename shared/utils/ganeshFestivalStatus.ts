import { todayDateKey } from "@/shared/utils/dates";

export type FestivalDisplayStatus = "upcoming" | "active" | "closed";

export const FESTIVAL_DISPLAY_LABEL: Record<FestivalDisplayStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  closed: "Closed",
};

export const CLOSED_FESTIVAL_WRITE_MESSAGE =
  "This festival is closed. Switch to an open festival to add money, collections, or seva.";

/**
 * An archived Pandal is readable but frozen (GS-017). Distinct from the closed
 * festival message: the festival is not the thing that ended, and restoring is
 * a Pandal-level action an admin takes, not a festival one.
 */
export const ARCHIVED_PANDAL_WRITE_MESSAGE =
  "This Pandal is archived. Its records stay readable, but nothing new can be added. A Pandal Admin can restore it from the Pandal screen.";

export const CLOSED_FESTIVAL_VIEW_MESSAGE =
  "You are viewing a closed festival. Money and seva stay locked.";

export function festivalWriteLocked(status?: string | null): boolean {
  return status === "closed";
}

/**
 * Stored status stays `open` | `closed`. Upcoming vs Active is derived from
 * the festival window in Asia/Kolkata.
 */
export function festivalDisplayStatus(
  festival: { status?: string; startDate?: string },
  today: string = todayDateKey("Asia/Kolkata")
): FestivalDisplayStatus {
  if (festival.status === "closed") return "closed";
  const start = festival.startDate?.trim();
  if (start && start > today) return "upcoming";
  return "active";
}

export function festivalDisplayLabel(
  festival: { status?: string; startDate?: string },
  today?: string
): string {
  return FESTIVAL_DISPLAY_LABEL[festivalDisplayStatus(festival, today)];
}
