/**
 * Persisted What-If scenario definitions (SPENDLY-202).
 *
 * Only user-authored assumptions and reproducibility metadata are stored.
 * Projection output is always recalculated from current canonical data.
 */

import {
  WHAT_IF_ENGINE_VERSION,
  WHAT_IF_LIMITS,
  validateWhatIfScenario,
  type WhatIfScenarioDefinition,
} from "../types/whatIf";

export type { WhatIfScenarioDefinition } from "../types/whatIf";

export const WHAT_IF_SCENARIO_NAME_MAX = WHAT_IF_LIMITS.maxNameLength;

export interface WhatIfScenarioDoc extends WhatIfScenarioDefinition {
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface WhatIfScenario extends WhatIfScenarioDoc {
  id: string;
}

export function validateWhatIfScenarioDoc(doc: WhatIfScenarioDoc): string[] {
  const issues = validateWhatIfScenario(doc);
  if (typeof doc.archived !== "boolean") issues.push("archived must be a boolean");
  if (!Number.isFinite(doc.createdAtMs) || doc.createdAtMs < 0) issues.push("createdAtMs must be a non-negative number");
  if (!Number.isFinite(doc.updatedAtMs) || doc.updatedAtMs < 0) issues.push("updatedAtMs must be a non-negative number");
  if (doc.updatedAtMs < doc.createdAtMs) issues.push("updatedAtMs must not precede createdAtMs");
  return issues;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizedDefinition(definition: WhatIfScenarioDefinition): WhatIfScenarioDefinition {
  return {
    ...clone(definition),
    name: definition.name.trim().slice(0, WHAT_IF_SCENARIO_NAME_MAX),
    engineVersion: WHAT_IF_ENGINE_VERSION,
    adjustments: clone(definition.adjustments),
    assumptions: clone(definition.assumptions),
    reference: {
      ...clone(definition.reference),
      sourceVersions: clone(definition.reference.sourceVersions),
    },
  };
}

/** Build the exact Firestore document written for a new or replaced scenario. */
export function whatIfScenarioDoc(input: {
  scenario: WhatIfScenarioDefinition;
  nowMs: number;
  existing?: Pick<WhatIfScenarioDoc, "createdAtMs" | "archived" | "version">;
}): WhatIfScenarioDoc {
  const scenario = normalizedDefinition(input.scenario);
  const doc: WhatIfScenarioDoc = {
    ...scenario,
    version: Math.max(1, scenario.version),
    archived: input.existing?.archived ?? false,
    createdAtMs: input.existing?.createdAtMs ?? input.nowMs,
    updatedAtMs: input.nowMs,
  };
  const issues = validateWhatIfScenarioDoc(doc);
  if (issues.length) throw new Error(issues.join("; "));
  return doc;
}

/** Edit an existing definition while preserving identity and incrementing its version. */
export function editWhatIfScenarioDoc(existing: WhatIfScenarioDoc, next: WhatIfScenarioDefinition, nowMs: number): WhatIfScenarioDoc {
  return whatIfScenarioDoc({ scenario: { ...next, id: existing.id, version: existing.version + 1 }, nowMs, existing });
}

/** Duplicate an independent scenario; its version starts at one and archive is cleared. */
export function duplicateWhatIfScenarioDoc(source: WhatIfScenarioDoc, name: string, nowMs: number): WhatIfScenarioDoc {
  return whatIfScenarioDoc({
    scenario: { ...clone(source), id: `${source.id}-copy`, name, version: 1, engineVersion: WHAT_IF_ENGINE_VERSION },
    nowMs,
  });
}

export function sortWhatIfScenarios(scenarios: readonly WhatIfScenario[]): WhatIfScenario[] {
  return [...scenarios].sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id));
}
