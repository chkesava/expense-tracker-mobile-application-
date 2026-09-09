/**
 * Copy that appears on more than one Ganesh screen.
 *
 * Anything used by a single screen belongs in that screen's namespace instead —
 * `common` earning its name is what keeps it reviewable.
 */
export const common = {
  "common.action.save": "Save",
  "common.action.cancel": "Cancel",
  "common.action.retry": "Retry",
  "common.action.back": "Back",
  "common.action.done": "Done",
  "common.action.remove": "Remove",
  "common.action.close": "Close",
  "common.action.viewAll": "View all",

  "common.state.loading": "Loading",
  "common.state.saving": "Saving",
  "common.state.offlineQueued": "Saved — will sync when you are back online",

  "common.error.generic": "Something went wrong. Please try again.",
  "common.error.connection": "Please check your connection and try again.",

  "common.role.admin": "Pandal Admin",
  "common.role.treasurer": "Treasurer",
  "common.role.member": "Member",
  "common.role.collector": "Collector",
  "common.role.viewer": "Viewer",

  "common.role.unknown": "Unknown",
  "common.status.active": "Active",
  "common.status.suspended": "Suspended",
  "common.status.removed": "Removed",
  "common.status.pending": "Pending",
  "common.status.unknown": "Unknown",
} as const;
