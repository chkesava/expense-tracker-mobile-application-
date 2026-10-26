/**
 * SPENDLY-608 — user-facing text for Save Goals validation issues.
 * One sentence each, written for the form field or toast that shows it.
 */

import { GOAL_LIMITS, type GoalStatus } from "../types/goal";
import type { GoalAction } from "./goalLifecycle";
import type { GoalIssue } from "./goalModel";

const MESSAGES: Record<GoalIssue, string> = {
  name_required: "Give the goal a name.",
  name_too_long: `Keep the name under ${GOAL_LIMITS.nameMax} characters.`,
  name_taken: "You already have a goal with this name.",
  amount_invalid: "Enter a valid amount.",
  amount_not_positive: "The amount must be more than zero.",
  amount_too_large: "That amount is too large.",
  amount_too_precise: "Use at most two decimal places.",
  target_invalid: "Enter a target amount greater than zero.",
  below_minimum_contribution: "This is below the goal's minimum contribution.",
  minimum_invalid: "The minimum contribution must be more than zero and no more than the target.",
  reduction_exceeds_saved: "You can't take out more than is saved in this goal.",
  result_negative: "This would make the saved amount negative.",
  status_blocks_amount_change: "This goal is closed. Reopen or restore it to change its amounts.",
  description_too_long: `Keep the description under ${GOAL_LIMITS.descriptionMax} characters.`,
  note_too_long: `Keep the note under ${GOAL_LIMITS.noteMax} characters.`,
  reason_invalid: "Choose a reason from the list.",
  icon_invalid: "Choose an icon from the list.",
  date_invalid: "Enter a valid date.",
  dates_out_of_order: "The start date must be on or before the target date.",
  transition_not_allowed: "That change isn't possible for this goal right now.",
  target_not_reached: "A goal can be completed once it reaches its target.",
  correction_target_invalid: "That entry can't be corrected.",
  correction_no_change: "The corrected amount is the same as before.",
  milestones_invalid: "Check the milestones: each needs an amount above zero.",
  reminders_invalid: "Check the reminder settings.",
  no_change: "Nothing to save.",
};

export function goalIssueMessage(issue: GoalIssue): string {
  return MESSAGES[issue];
}

/** First issue's message — what a toast shows. */
export function goalIssuesMessage(issues: readonly GoalIssue[]): string {
  return issues.length > 0 ? MESSAGES[issues[0]] : "Something went wrong.";
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};

export const GOAL_ACTION_LABELS: Record<GoalAction, string> = {
  pause: "Pause",
  resume: "Resume",
  complete: "Mark completed",
  reopen: "Reopen",
  cancel: "Cancel goal",
  restore: "Restore",
  archive: "Archive",
  unarchive: "Unarchive",
};

/** Success toast copy per action. */
export const GOAL_ACTION_DONE: Record<GoalAction, string> = {
  pause: "Goal paused",
  resume: "Goal resumed",
  complete: "Goal completed",
  reopen: "Goal reopened",
  cancel: "Goal cancelled",
  restore: "Goal restored",
  archive: "Goal archived",
  unarchive: "Goal unarchived",
};

/** Actions that deserve a confirmation step. */
export function goalActionNeedsConfirm(action: GoalAction): boolean {
  return action === "cancel" || action === "archive" || action === "complete";
}
