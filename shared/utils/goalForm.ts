/**
 * SPENDLY-608 — the create/edit goal form: text fields in, a validated
 * builder input (or per-field messages) out. Pure, so the form's rules are
 * tested here and the sheet only renders them.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalIconKey } from "../types/goal";
import { isValidDateKey } from "./dates";
import { goalIssueMessage } from "./goalMessages";
import {
  isGoalNameTaken,
  parseGoalAmount,
  validateGoalName,
  validateNonNegativeAmount,
  validatePositiveAmount,
} from "./goalModel";
import { GOAL_LIMITS } from "../types/goal";

export type GoalFormValues = {
  name: string;
  target: string;
  /** Create only: what is already saved. */
  initial: string;
  description: string;
  iconKey: GoalIconKey;
  startDate: string;
  targetDate: string;
  minimum: string;
};

export type GoalFormField = keyof GoalFormValues;

export type ParsedGoalForm =
  | {
      ok: true;
      value: {
        name: string;
        targetAmount: number;
        initialAmount: number;
        description?: string;
        iconKey: GoalIconKey;
        startDate?: string;
        targetDate?: string;
        minimumContribution?: number;
      };
    }
  | { ok: false; errors: Partial<Record<GoalFormField, string>> };

export const EMPTY_GOAL_FORM: GoalFormValues = {
  name: "",
  target: "",
  initial: "",
  description: "",
  iconKey: "piggy-bank",
  startDate: "",
  targetDate: "",
  minimum: "",
};

export function goalFormFromGoal(goal: FinancialGoal): GoalFormValues {
  return {
    name: goal.name ?? "",
    target: String(goal.targetAmount ?? ""),
    initial: "",
    description: goal.description ?? "",
    iconKey: goal.iconKey ?? "piggy-bank",
    startDate: goal.startDate ?? "",
    targetDate: goal.deadline ?? "",
    minimum: goal.minimumContribution !== undefined ? String(goal.minimumContribution) : "",
  };
}

export function parseGoalForm(
  values: GoalFormValues,
  options: { mode: "create" | "edit"; goals: readonly Pick<FinancialGoal, "id" | "name">[]; selfId?: string }
): ParsedGoalForm {
  const errors: Partial<Record<GoalFormField, string>> = {};

  const nameIssues = validateGoalName(values.name);
  if (nameIssues.length) errors.name = goalIssueMessage(nameIssues[0]);
  else if (isGoalNameTaken(values.name, options.goals, options.selfId)) errors.name = goalIssueMessage("name_taken");

  const target = parseGoalAmount(values.target);
  if (validatePositiveAmount(target).length) errors.target = goalIssueMessage("target_invalid");

  const initial = values.initial.trim() === "" ? 0 : parseGoalAmount(values.initial);
  if (options.mode === "create" && validateNonNegativeAmount(initial).length) errors.initial = goalIssueMessage("amount_invalid");

  if (values.description.trim().length > GOAL_LIMITS.descriptionMax) errors.description = goalIssueMessage("description_too_long");

  if (values.startDate && !isValidDateKey(values.startDate)) errors.startDate = goalIssueMessage("date_invalid");
  if (values.targetDate && !isValidDateKey(values.targetDate)) errors.targetDate = goalIssueMessage("date_invalid");
  if (!errors.startDate && !errors.targetDate && values.startDate && values.targetDate && values.startDate > values.targetDate) {
    errors.targetDate = goalIssueMessage("dates_out_of_order");
  }

  const minimum = values.minimum.trim() === "" ? undefined : parseGoalAmount(values.minimum);
  if (minimum !== undefined && (validatePositiveAmount(minimum).length || (!errors.target && minimum > target))) {
    errors.minimum = goalIssueMessage("minimum_invalid");
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: values.name,
      targetAmount: target,
      initialAmount: options.mode === "create" ? initial : 0,
      description: values.description.trim() || undefined,
      iconKey: values.iconKey,
      startDate: values.startDate || undefined,
      targetDate: values.targetDate || undefined,
      minimumContribution: minimum,
    },
  };
}
