import type { RunwaySchedule } from "./runwayEngine";
import { validateWhatIfAdjustment, type WhatIfAdjustment, type WhatIfProvenance } from "../types/whatIf";

export const WHAT_IF_CASHFLOW_KINDS = ["income", "expense"] as const;
export type WhatIfCashflowKind = (typeof WHAT_IF_CASHFLOW_KINDS)[number];

export const WHAT_IF_CASHFLOW_ACTIONS = ["add", "increase", "decrease", "remove", "replace", "delay"] as const;
export type WhatIfCashflowAction = (typeof WHAT_IF_CASHFLOW_ACTIONS)[number];

export interface WhatIfCashflowChange {
  id: string;
  label: string;
  kind: WhatIfCashflowKind;
  action: WhatIfCashflowAction;
  /** Delta for add/increase/decrease; replacement amount for replace. */
  amount: number;
  schedule: RunwaySchedule;
  /** Required for remove, replace and delay. */
  sourceRef?: { source: string; refId: string };
  /** The original schedule to remove when delaying a canonical event. */
  originalSchedule?: RunwaySchedule;
  provenance: WhatIfProvenance;
}

const opposite = (direction: "in" | "out"): "in" | "out" => direction === "in" ? "out" : "in";
const baseDirection = (kind: WhatIfCashflowKind): "in" | "out" => kind === "income" ? "in" : "out";

function makeAdjustment(change: WhatIfCashflowChange, overrides: Partial<WhatIfAdjustment> = {}): WhatIfAdjustment {
  const direction = overrides.direction ?? baseDirection(change.kind);
  return {
    id: change.id,
    label: change.label,
    kind: change.kind,
    operation: overrides.operation ?? "add",
    direction,
    amount: overrides.amount ?? change.amount,
    schedule: overrides.schedule ?? change.schedule,
    sourceRef: "sourceRef" in overrides ? overrides.sourceRef : change.sourceRef,
    provenance: change.provenance,
  };
}

/**
 * Converts a user-facing income/expense action into the common What-If
 * adjustment contract. It never writes or edits the source record.
 */
export function buildCashflowAdjustments(change: WhatIfCashflowChange): WhatIfAdjustment[] {
  switch (change.action) {
    case "add":
    case "increase":
      return [makeAdjustment(change)];
    case "decrease":
      return [makeAdjustment(change, { direction: opposite(baseDirection(change.kind)) })];
    case "remove":
      return [makeAdjustment(change, { operation: "remove", amount: 0 })];
    case "replace":
      return [makeAdjustment(change, { operation: "replace" })];
    case "delay":
      return [
        makeAdjustment(change, { id: `${change.id}:remove`, operation: "remove", amount: 0, schedule: change.originalSchedule ?? change.schedule }),
        makeAdjustment(change, { id: `${change.id}:delayed`, sourceRef: undefined }),
      ];
  }
}

export function buildOneTimePurchase(input: {
  id: string;
  label: string;
  amount: number;
  date: string;
  provenance: WhatIfProvenance;
}): WhatIfAdjustment {
  return makeAdjustment({
    id: input.id,
    label: input.label,
    kind: "expense",
    action: "add",
    amount: input.amount,
    schedule: { kind: "once", date: input.date },
    provenance: input.provenance,
  });
}

export function validateCashflowChange(change: WhatIfCashflowChange): string[] {
  if (!change || typeof change !== "object") return ["cashflow change is required"];
  const errors: string[] = [];
  if (!WHAT_IF_CASHFLOW_KINDS.includes(change.kind)) errors.push("kind must be income or expense");
  if (!WHAT_IF_CASHFLOW_ACTIONS.includes(change.action)) errors.push("action is invalid");
  if (!Number.isFinite(change.amount) || change.amount < 0) errors.push("amount must be zero or more");
  if (["add", "increase", "decrease", "replace"].includes(change.action) && change.amount <= 0) errors.push("amount must be greater than zero for this action");
  if (["remove", "replace", "delay"].includes(change.action) && !change.sourceRef) errors.push(`${change.action} requires sourceRef`);
  if (change.action === "delay" && !change.originalSchedule) errors.push("delay requires originalSchedule");

  const adjustments = buildCashflowAdjustments(change);
  adjustments.forEach((adjustment, index) => {
    errors.push(...validateWhatIfAdjustment(adjustment, index));
  });
  return [...new Set(errors)];
}
