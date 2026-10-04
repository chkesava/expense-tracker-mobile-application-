import type { BurnClass } from "./runway";
import type { RunwayBaseline, RunwayEvent, RunwaySchedule } from "../utils/runwayEngine";
import { isValidDateKey, isValidMonthKey } from "../utils/dates";

/** Version of the What-If scenario contract, independent of calculated output. */
export const WHAT_IF_ENGINE_VERSION = 1;
export const WHAT_IF_DEFAULT_PROJECTION_MONTHS = 12;

export const WHAT_IF_LIMITS = {
  maxNameLength: 80,
  maxIdLength: 128,
  maxLabelLength: 160,
  maxCurrencyLength: 12,
  maxTimezoneLength: 64,
  maxProjectionMonths: 24,
  maxAdjustments: 100,
  maxAssumptions: 100,
  maxMoney: 1_000_000_000_000,
} as const;

export const WHAT_IF_ADJUSTMENT_KINDS = [
  "income",
  "expense",
  "debt",
  "savings",
  "goal",
  "investment",
  "commitment",
] as const;
export type WhatIfAdjustmentKind = (typeof WHAT_IF_ADJUSTMENT_KINDS)[number];

export const WHAT_IF_OPERATIONS = ["add", "remove", "replace"] as const;
export type WhatIfAdjustmentOperation = (typeof WHAT_IF_OPERATIONS)[number];

export const WHAT_IF_PROVENANCE_KINDS = ["canonical", "user", "derived"] as const;
export type WhatIfProvenanceKind = (typeof WHAT_IF_PROVENANCE_KINDS)[number];

/** Where an assumption came from; user-authored assumptions are not facts. */
export interface WhatIfProvenance {
  kind: WhatIfProvenanceKind;
  source: string;
  refId?: string;
  asOfDate: string;
}

export interface WhatIfAssumption {
  code: string;
  label: string;
  value: string | number | boolean | null;
  provenance: WhatIfProvenance;
}

/** A hypothetical change. It is an input to a calculation, never a ledger write. */
export interface WhatIfAdjustment {
  id: string;
  label: string;
  kind: WhatIfAdjustmentKind;
  operation: WhatIfAdjustmentOperation;
  direction: "in" | "out";
  amount: number;
  schedule: RunwaySchedule;
  burnClass?: BurnClass;
  sourceRef?: { source: string; refId: string };
  provenance: WhatIfProvenance;
}

/** Metadata used to rebuild a derived baseline; source records are not copied here. */
export interface WhatIfBaselineReference {
  asOfDate: string;
  currency: string;
  timezone: string;
  sourceVersions: readonly { source: string; version: string }[];
}

/** Runtime-only derived baseline. This must not be persisted as a saved scenario. */
export interface WhatIfBaselineSnapshot {
  reference: WhatIfBaselineReference;
  liquid: number | null;
  baseline: RunwayBaseline | null;
  events: readonly RunwayEvent[];
}

/** Persistable user-authored scenario definition. Calculated output is intentionally absent. */
export interface WhatIfScenarioDefinition {
  id: string;
  name: string;
  version: number;
  engineVersion: number;
  reference: WhatIfBaselineReference;
  durationMonths: number;
  adjustments: readonly WhatIfAdjustment[];
  assumptions: readonly WhatIfAssumption[];
}

export interface WhatIfScenarioInput {
  scenario: WhatIfScenarioDefinition;
  baseline: WhatIfBaselineSnapshot;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isOneOf = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === "string" && values.includes(value);

function validateText(value: unknown, field: string, maxLength: number, required = true): string[] {
  const errors: string[] = [];
  if (typeof value !== "string") return [`${field} must be a string`];
  if (required && value.trim().length === 0) errors.push(`${field} must not be empty`);
  if (value.length > maxLength) errors.push(`${field} must be at most ${maxLength} characters`);
  return errors;
}

function validateMoney(value: unknown, field: string, allowNegative = false): string[] {
  if (!isFiniteNumber(value)) return [`${field} must be a finite number`];
  if (!allowNegative && value < 0) return [`${field} must be zero or more`];
  if (Math.abs(value) > WHAT_IF_LIMITS.maxMoney) return [`${field} is too large`];
  return [];
}

function validateProvenance(provenance: WhatIfProvenance, field: string): string[] {
  if (!provenance || typeof provenance !== "object") return [`${field} is required`];
  const errors = [
    ...validateText(provenance.source, `${field}.source`, WHAT_IF_LIMITS.maxIdLength),
    ...(!isOneOf(WHAT_IF_PROVENANCE_KINDS, provenance.kind) ? [`${field}.kind is invalid`] : []),
    ...(!isValidDateKey(provenance.asOfDate) ? [`${field}.asOfDate must be a valid date`] : []),
  ];
  if (provenance.refId !== undefined) errors.push(...validateText(provenance.refId, `${field}.refId`, WHAT_IF_LIMITS.maxIdLength));
  return errors;
}

function validateSchedule(schedule: RunwaySchedule, field: string): string[] {
  if (!schedule || typeof schedule !== "object" || !isOneOf(["once", "monthly", "every_n_days"] as const, schedule.kind)) {
    return [`${field}.kind is invalid`];
  }
  if (schedule.kind === "once") return isValidDateKey(schedule.date) ? [] : [`${field}.date must be a valid date`];

  const errors = isValidDateKey(schedule.firstDate) ? [] : [`${field}.firstDate must be a valid date`];
  if (schedule.kind === "monthly") {
    if (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
      errors.push(`${field}.dayOfMonth must be a whole number from 1 to 31`);
    }
    if (schedule.intervalMonths !== undefined && (!Number.isInteger(schedule.intervalMonths) || schedule.intervalMonths < 1 || schedule.intervalMonths > 12)) {
      errors.push(`${field}.intervalMonths must be a whole number from 1 to 12`);
    }
    if (schedule.untilMonth !== undefined && !isValidMonthKey(schedule.untilMonth)) errors.push(`${field}.untilMonth must be a valid month`);
  } else if (!Number.isInteger(schedule.intervalDays) || schedule.intervalDays < 1 || schedule.intervalDays > 366) {
    errors.push(`${field}.intervalDays must be a whole number from 1 to 366`);
  } else if (schedule.untilDate !== undefined && !isValidDateKey(schedule.untilDate)) {
    errors.push(`${field}.untilDate must be a valid date`);
  }
  return errors;
}

export function validateWhatIfAdjustment(adjustment: WhatIfAdjustment, index = 0): string[] {
  const field = `adjustments[${index}]`;
  if (!adjustment || typeof adjustment !== "object") return [`${field} is required`];
  const errors = [
    ...validateText(adjustment.id, `${field}.id`, WHAT_IF_LIMITS.maxIdLength),
    ...validateText(adjustment.label, `${field}.label`, WHAT_IF_LIMITS.maxLabelLength),
    ...(!isOneOf(WHAT_IF_ADJUSTMENT_KINDS, adjustment.kind) ? [`${field}.kind is invalid`] : []),
    ...(!isOneOf(WHAT_IF_OPERATIONS, adjustment.operation) ? [`${field}.operation is invalid`] : []),
    ...(!isOneOf(["in", "out"] as const, adjustment.direction) ? [`${field}.direction is invalid`] : []),
    ...validateMoney(adjustment.amount, `${field}.amount`),
    ...validateSchedule(adjustment.schedule, `${field}.schedule`),
    ...validateProvenance(adjustment.provenance, `${field}.provenance`),
  ];
  if (adjustment.sourceRef) {
    errors.push(...validateText(adjustment.sourceRef.source, `${field}.sourceRef.source`, WHAT_IF_LIMITS.maxIdLength));
    errors.push(...validateText(adjustment.sourceRef.refId, `${field}.sourceRef.refId`, WHAT_IF_LIMITS.maxIdLength));
  }
  return errors;
}

function validateReference(reference: WhatIfBaselineReference, field: string): string[] {
  if (!reference || typeof reference !== "object") return [`${field} is required`];
  const errors = [
    ...(!isValidDateKey(reference.asOfDate) ? [`${field}.asOfDate must be a valid date`] : []),
    ...validateText(reference.currency, `${field}.currency`, WHAT_IF_LIMITS.maxCurrencyLength),
    ...validateText(reference.timezone, `${field}.timezone`, WHAT_IF_LIMITS.maxTimezoneLength),
  ];
  if (!Array.isArray(reference.sourceVersions)) errors.push(`${field}.sourceVersions must be an array`);
  else reference.sourceVersions.forEach((source, index) => {
    errors.push(...validateText(source.source, `${field}.sourceVersions[${index}].source`, WHAT_IF_LIMITS.maxIdLength));
    errors.push(...validateText(source.version, `${field}.sourceVersions[${index}].version`, WHAT_IF_LIMITS.maxIdLength));
  });
  return errors;
}

export function validateWhatIfScenario(scenario: WhatIfScenarioDefinition): string[] {
  if (!scenario || typeof scenario !== "object") return ["scenario is required"];
  const errors = [
    ...validateText(scenario.id, "id", WHAT_IF_LIMITS.maxIdLength),
    ...validateText(scenario.name, "name", WHAT_IF_LIMITS.maxNameLength),
    ...validateReference(scenario.reference, "reference"),
  ];
  if (!Number.isInteger(scenario.version) || scenario.version < 1) errors.push("version must be a positive whole number");
  if (scenario.engineVersion !== WHAT_IF_ENGINE_VERSION) errors.push(`engineVersion must be ${WHAT_IF_ENGINE_VERSION}`);
  if (!Number.isInteger(scenario.durationMonths) || scenario.durationMonths < 1 || scenario.durationMonths > WHAT_IF_LIMITS.maxProjectionMonths) {
    errors.push(`durationMonths must be a whole number from 1 to ${WHAT_IF_LIMITS.maxProjectionMonths}`);
  }
  if (!Array.isArray(scenario.adjustments)) errors.push("adjustments must be an array");
  else {
    if (scenario.adjustments.length > WHAT_IF_LIMITS.maxAdjustments) errors.push(`adjustments must contain at most ${WHAT_IF_LIMITS.maxAdjustments} items`);
    scenario.adjustments.forEach((adjustment, index) => errors.push(...validateWhatIfAdjustment(adjustment, index)));
  }
  if (!Array.isArray(scenario.assumptions)) errors.push("assumptions must be an array");
  else {
    if (scenario.assumptions.length > WHAT_IF_LIMITS.maxAssumptions) errors.push(`assumptions must contain at most ${WHAT_IF_LIMITS.maxAssumptions} items`);
    scenario.assumptions.forEach((assumption, index) => {
      errors.push(...validateText(assumption.code, `assumptions[${index}].code`, WHAT_IF_LIMITS.maxIdLength));
      errors.push(...validateText(assumption.label, `assumptions[${index}].label`, WHAT_IF_LIMITS.maxLabelLength));
      errors.push(...validateProvenance(assumption.provenance, `assumptions[${index}].provenance`));
    });
  }
  return errors;
}

export function validateWhatIfBaselineSnapshot(snapshot: WhatIfBaselineSnapshot): string[] {
  if (!snapshot || typeof snapshot !== "object") return ["baseline is required"];
  const errors = validateReference(snapshot.reference, "baseline.reference");
  if (snapshot.liquid !== null) errors.push(...validateMoney(snapshot.liquid, "baseline.liquid", true));
  if (snapshot.baseline) {
    errors.push(...validateMoney(snapshot.baseline.monthlyEarnedIncome, "baseline.monthlyEarnedIncome"));
    Object.entries(snapshot.baseline.monthlyOutflowByClass).forEach(([key, value]) => errors.push(...validateMoney(value, `baseline.monthlyOutflowByClass.${key}`)));
  }
  if (!Array.isArray(snapshot.events)) errors.push("baseline.events must be an array");
  else snapshot.events.forEach((event, index) => {
    errors.push(...validateText(event.id, `baseline.events[${index}].id`, WHAT_IF_LIMITS.maxIdLength));
    errors.push(...validateText(event.label, `baseline.events[${index}].label`, WHAT_IF_LIMITS.maxLabelLength));
    errors.push(...validateMoney(event.amount, `baseline.events[${index}].amount`));
    errors.push(...validateSchedule(event.schedule, `baseline.events[${index}].schedule`));
  });
  return errors;
}
