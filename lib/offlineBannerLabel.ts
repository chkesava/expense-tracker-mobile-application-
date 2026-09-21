const asOfTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export type OfflineBannerState = "hidden" | "offline" | "syncing" | "synced";

export function formatLastServerSyncAt(at: number): string {
  return asOfTimeFormatter.format(new Date(at));
}

export function getBannerLabel(
  state: OfflineBannerState,
  pendingSyncCount: number,
  lastServerSyncAt: number | null = null
): string {
  switch (state) {
    case "offline":
      return lastServerSyncAt != null
        ? `No Internet Connection · as of ${formatLastServerSyncAt(lastServerSyncAt)}`
        : "No Internet Connection";
    case "syncing":
      return pendingSyncCount === 1
        ? "Syncing 1 change…"
        : `Syncing ${pendingSyncCount} changes…`;
    case "synced":
      return "Back Online — All Synced!";
    default:
      return "";
  }
}
