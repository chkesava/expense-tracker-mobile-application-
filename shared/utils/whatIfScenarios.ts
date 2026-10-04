/**
 * Persisted What-If scenario definitions (SPENDLY-202).
 *
 * Only user-authored assumptions and reproducibility metadata are stored.
 * Projection output is always recalculated from current canonical data.
 *
 * Identity is the Firestore document id. The stored body never carries an
 * `id` field (the rules refuse it), so a duplicate is a new document and
 * can never collide with, or overwrite, its source.
 *
 * Every lifecycle change appends to a capped `history`, so version and
 * assumption changes stay traceable without unbounded document growth.
 */

import {
  WHAT_IF_ENGINE_VERSION,
  WHAT_IF_LIMITS,
  validateWhatIfScenario,
  type WhatIfBaselineReference,
  type WhatIfScenarioDefinition,
} from "../types/whatIf";
import { isValidDateKey } from "./dates";

export type { WhatIfScenarioDefinition } from "../types/whatIf";

export const WHAT_IF_SCENARIO_NAME_MAX = WHAT_IF_LIMITS.maxNameLength;

/** Most recent history entries kept on a scenario; older ones drop off. */
export const WHAT_IF_HISTORY_LIMIT = 20;

export const WHAT_IF_HISTORY_ACTIONS = ["created", "edited", "renamed", "archived", "restored", "duplicated", "rebased"] as const;
export type WhatIfHistoryAction = (typeof WHAT_IF_HISTORY_ACTIONS)[number];

/** User-authored parts of a scenario whose changes are recorded in history. */
export const WHAT_IF_TRACKED_FIELDS = ["name", "durationMonths", "adjustments", "assumptions", "reference"] as const;
export type WhatIfTrackedField = (typeof WHAT_IF_TRACKED_FIELDS)[number];

export interface WhatIfHistoryEntry {
  version: number;
  atMs: number;
  action: WhatIfHistoryAction;
  fields: WhatIfTrackedField[];
  /** Source scenario id, for a duplicate. */
  fromId?: string;
}

/**
 * Which reference a recalculation projects from:
 * - `saved`: the scenario's own as-of date, currency and timezone, applied to
 *   current canonical records. The default when reopening a scenario.
 * - `current`: today's reference. Choosing it explicitly is a "rebase".
 * Either way the derived baseline is rebuilt from canonical data; no saved
 * snapshot of financial records exists to fall back on.
 */
export const WHAT_IF_BASELINE_MODES = ["saved", "current"] as const;
export type WhatIfBaselineMode = (typeof WHAT_IF_BASELINE_MODES)[number];

export interface WhatIfLastCalculated {
  atMs: number;
  engineVersion: number;
  mode: WhatIfBaselineMode;
  asOfDate: string;
}

/** The stored body at users/{uid}/whatIfScenarios/{id}. */
export type WhatIfScenarioDoc = Omit<WhatIfScenarioDefinition, "id"> & {
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  history: WhatIfHistoryEntry[];
  lastCalculated?: WhatIfLastCalculated;
};

/** A stored scenario with its document id. */
export interface WhatIfScenario extends WhatIfScenarioDoc {
  id: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateHistory(history: unknown): string[] {
  if (!Array.isArray(history)) return ["history must be a list"];
  const issues: string[] = [];
  if (history.length < 1 || history.length > WHAT_IF_HISTORY_LIMIT) issues.push(`history must hold 1 to ${WHAT_IF_HISTORY_LIMIT} entries`);
  for (const entry of history as WhatIfHistoryEntry[]) {
    if (!Number.isInteger(entry?.version) || entry.version < 1) issues.push("history version must be a positive whole number");
    if (!WHAT_IF_HISTORY_ACTIONS.includes(entry?.action)) issues.push("history action is not recognised");
    if (!Array.isArray(entry?.fields) || entry.fields.some((f) => !WHAT_IF_TRACKED_FIELDS.includes(f))) issues.push("history fields are not recognised");
  }
  return issues;
}

export function validateWhatIfScenarioDoc(doc: WhatIfScenarioDoc): string[] {
  if ("id" in doc) return ["a stored scenario must not carry an id field"];
  // The definition validator expects an id; the document id plays that role.
  const issues = validateWhatIfScenario({ ...doc, id: "stored" } as WhatIfScenarioDefinition);
  if (typeof doc.archived !== "boolean") issues.push("archived must be a boolean");
  if (!Number.isFinite(doc.createdAtMs) || doc.createdAtMs < 0) issues.push("createdAtMs must be a non-negative number");
  if (!Number.isFinite(doc.updatedAtMs) || doc.updatedAtMs < 0) issues.push("updatedAtMs must be a non-negative number");
  if (doc.updatedAtMs < doc.createdAtMs) issues.push("updatedAtMs must not precede createdAtMs");
  issues.push(...validateHistory(doc.history));
  if (doc.lastCalculated !== undefined) {
    const calc = doc.lastCalculated;
    if (!Number.isFinite(calc.atMs) || calc.atMs < 0) issues.push("lastCalculated.atMs must be a non-negative number");
    if (!Number.isInteger(calc.engineVersion) || calc.engineVersion < 1) issues.push("lastCalculated.engineVersion must be a positive whole number");
    if (!WHAT_IF_BASELINE_MODES.includes(calc.mode)) issues.push("lastCalculated.mode is not recognised");
    if (!isValidDateKey(calc.asOfDate)) issues.push("lastCalculated.asOfDate must be a date");
  }
  return issues;
}

function assertValid(doc: WhatIfScenarioDoc): WhatIfScenarioDoc {
  const issues = validateWhatIfScenarioDoc(doc);
  if (issues.length) throw new Error(issues.join("; "));
  return doc;
}

/** The user-authored part of a definition, normalized, without its id. */
function storedDefinition(definition: Omit<WhatIfScenarioDefinition, "id"> & { id?: string }): Omit<WhatIfScenarioDefinition, "id"> {
  return {
    name: definition.name.trim().slice(0, WHAT_IF_SCENARIO_NAME_MAX),
    version: definition.version,
    engineVersion: WHAT_IF_ENGINE_VERSION,
    reference: clone(definition.reference),
    durationMonths: definition.durationMonths,
    adjustments: clone(definition.adjustments),
    assumptions: clone(definition.assumptions),
  };
}

function appendHistory(history: readonly WhatIfHistoryEntry[], entry: WhatIfHistoryEntry): WhatIfHistoryEntry[] {
  return [...clone(history), entry].slice(-WHAT_IF_HISTORY_LIMIT);
}

/** Tracked fields whose stored value differs between two scenarios. */
export function changedWhatIfFields(
  before: Pick<WhatIfScenarioDoc, WhatIfTrackedField>,
  after: Pick<WhatIfScenarioDoc, WhatIfTrackedField>
): WhatIfTrackedField[] {
  return WHAT_IF_TRACKED_FIELDS.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

/** Rebuild the engine-facing definition from a stored scenario. */
export function toWhatIfScenarioDefinition(scenario: WhatIfScenario): WhatIfScenarioDefinition {
  return { id: scenario.id, ...storedDefinition(scenario), version: scenario.version };
}

/** The body written for a brand-new scenario. */
export function whatIfScenarioDoc(input: { scenario: Omit<WhatIfScenarioDefinition, "id"> & { id?: string }; nowMs: number }): WhatIfScenarioDoc {
  return assertValid({
    ...storedDefinition(input.scenario),
    version: 1,
    archived: false,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    history: [{ version: 1, atMs: input.nowMs, action: "created", fields: [] }],
  });
}

/** The stored body of a doc or a loaded scenario (the document id is not part of it). */
function bodyOf(doc: WhatIfScenarioDoc | WhatIfScenario): WhatIfScenarioDoc {
  const { id: _id, ...rest } = doc as WhatIfScenario;
  void _id;
  return rest;
}

function withoutLastCalculated(doc: WhatIfScenarioDoc): WhatIfScenarioDoc {
  const { lastCalculated: _drop, ...rest } = bodyOf(doc);
  void _drop;
  return rest;
}

/**
 * Apply user edits. Identity, creation time and archive state are kept, the
 * version increments and the changed fields are recorded. Returns null when
 * nothing changed, so callers can skip the write. Any assumption change
 * clears `lastCalculated`, because an earlier result no longer describes it.
 */
export function editWhatIfScenarioDoc(
  existing: WhatIfScenarioDoc | WhatIfScenario,
  next: Omit<WhatIfScenarioDefinition, "id"> & { id?: string },
  nowMs: number
): WhatIfScenarioDoc | null {
  const proposed = storedDefinition(next);
  const fields = changedWhatIfFields(existing, proposed);
  if (fields.length === 0) return null;
  const version = existing.version + 1;
  const action: WhatIfHistoryAction = fields.length === 1 && fields[0] === "name" ? "renamed" : "edited";
  const base = action === "renamed" ? bodyOf(existing) : withoutLastCalculated(existing);
  return assertValid({
    ...base,
    ...proposed,
    version,
    updatedAtMs: Math.max(nowMs, existing.createdAtMs),
    history: appendHistory(existing.history, { version, atMs: nowMs, action, fields }),
  });
}

export function renameWhatIfScenarioDoc(existing: WhatIfScenarioDoc | WhatIfScenario, name: string, nowMs: number): WhatIfScenarioDoc | null {
  return editWhatIfScenarioDoc(existing, { ...existing, name }, nowMs);
}

/** Archive or restore. Returns null when already in that state. */
export function archiveWhatIfScenarioDoc(existing: WhatIfScenarioDoc | WhatIfScenario, archived: boolean, nowMs: number): WhatIfScenarioDoc | null {
  if (existing.archived === archived) return null;
  const version = existing.version + 1;
  return assertValid({
    ...bodyOf(existing),
    archived,
    version,
    updatedAtMs: Math.max(nowMs, existing.createdAtMs),
    history: appendHistory(existing.history, { version, atMs: nowMs, action: archived ? "archived" : "restored", fields: [] }),
  });
}

/** An independent copy: new identity (assigned by the store), version 1, active, fresh history. */
export function duplicateWhatIfScenarioDoc(source: WhatIfScenario, name: string, nowMs: number): WhatIfScenarioDoc {
  return assertValid({
    ...storedDefinition({ ...source, name }),
    version: 1,
    archived: false,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    history: [{ version: 1, atMs: nowMs, action: "duplicated", fields: [], fromId: source.id }],
  });
}

/** Move the scenario's reference to today's (the explicit "current baseline" choice). */
export function rebaseWhatIfScenarioDoc(existing: WhatIfScenarioDoc | WhatIfScenario, current: WhatIfBaselineReference, nowMs: number): WhatIfScenarioDoc | null {
  if (JSON.stringify(existing.reference) === JSON.stringify(current)) return null;
  const version = existing.version + 1;
  return assertValid({
    ...withoutLastCalculated(existing),
    reference: clone(current),
    version,
    updatedAtMs: Math.max(nowMs, existing.createdAtMs),
    history: appendHistory(existing.history, { version, atMs: nowMs, action: "rebased", fields: ["reference"] }),
  });
}

/**
 * Record that a projection was run. Metadata only: the version and
 * `updatedAtMs` are unchanged, and no projection output is stored.
 */
export function markWhatIfScenarioCalculated(
  existing: WhatIfScenarioDoc | WhatIfScenario,
  run: { mode: WhatIfBaselineMode; asOfDate: string },
  nowMs: number
): WhatIfScenarioDoc {
  return assertValid({
    ...bodyOf(existing),
    lastCalculated: { atMs: nowMs, engineVersion: WHAT_IF_ENGINE_VERSION, mode: run.mode, asOfDate: run.asOfDate },
  });
}

/** The reference a recalculation must use, per the explicit baseline rule. */
export function whatIfCalculationReference(
  saved: Pick<WhatIfScenarioDoc, "reference">,
  current: WhatIfBaselineReference,
  mode: WhatIfBaselineMode
): WhatIfBaselineReference {
  return clone(mode === "saved" ? saved.reference : current);
}

export interface WhatIfRecalculationStatus {
  savedAsOfDate: string;
  currentAsOfDate: string;
  /** Sources whose version differs from, or is missing in, the saved reference. */
  changedSources: string[];
  currencyChanged: boolean;
  /** The scenario was saved by an older or newer engine version. */
  engineChanged: boolean;
  /** Nothing the projection depends on has changed since the scenario was saved. */
  upToDate: boolean;
}

/** What changed between a saved scenario's reference and today's, for "inputs changed since you saved" notices. */
export function whatIfRecalculationStatus(
  saved: Pick<WhatIfScenarioDoc, "reference" | "engineVersion">,
  current: WhatIfBaselineReference
): WhatIfRecalculationStatus {
  const savedVersions = new Map(saved.reference.sourceVersions.map((s) => [s.source, s.version]));
  const currentVersions = new Map(current.sourceVersions.map((s) => [s.source, s.version]));
  const sources = new Set([...savedVersions.keys(), ...currentVersions.keys()]);
  const changedSources = [...sources].filter((source) => savedVersions.get(source) !== currentVersions.get(source)).sort();
  const currencyChanged = saved.reference.currency !== current.currency;
  const engineChanged = saved.engineVersion !== WHAT_IF_ENGINE_VERSION;
  return {
    savedAsOfDate: saved.reference.asOfDate,
    currentAsOfDate: current.asOfDate,
    changedSources,
    currencyChanged,
    engineChanged,
    upToDate: changedSources.length === 0 && !currencyChanged && !engineChanged,
  };
}

/** Active scenarios first, then most recently changed. */
export function sortWhatIfScenarios(scenarios: readonly WhatIfScenario[]): WhatIfScenario[] {
  return [...scenarios].sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id));
}

/** Read a stored body defensively; the document id always wins over any stray body field. */
export function whatIfScenarioFromSnapshot(id: string, data: Record<string, unknown>): WhatIfScenario {
  const body = data as Partial<WhatIfScenarioDoc>;
  return {
    ...(body as WhatIfScenarioDoc),
    adjustments: Array.isArray(body.adjustments) ? body.adjustments : [],
    assumptions: Array.isArray(body.assumptions) ? body.assumptions : [],
    history: Array.isArray(body.history) ? body.history : [],
    id,
  };
}
