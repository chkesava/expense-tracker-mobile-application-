import { describe, expect, it } from "vitest";
import { WHAT_IF_ENGINE_VERSION, type WhatIfBaselineReference, type WhatIfScenarioDefinition } from "../types/whatIf";
import {
  archiveWhatIfScenarioDoc,
  changedWhatIfFields,
  duplicateWhatIfScenarioDoc,
  editWhatIfScenarioDoc,
  markWhatIfScenarioCalculated,
  rebaseWhatIfScenarioDoc,
  renameWhatIfScenarioDoc,
  sortWhatIfScenarios,
  toWhatIfScenarioDefinition,
  validateWhatIfScenarioDoc,
  WHAT_IF_HISTORY_LIMIT,
  whatIfCalculationReference,
  whatIfRecalculationStatus,
  whatIfScenarioDoc,
  whatIfScenarioFromSnapshot,
  type WhatIfScenario,
} from "./whatIfScenarios";

const reference: WhatIfBaselineReference = { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [{ source: "runway", version: "1" }] };
const definition: WhatIfScenarioDefinition = {
  id: "draft",
  name: "Raise plan",
  version: 1,
  engineVersion: WHAT_IF_ENGINE_VERSION,
  reference,
  durationMonths: 12,
  adjustments: [],
  assumptions: [],
};
const stored = (id = "s1", nowMs = 100): WhatIfScenario => ({ ...whatIfScenarioDoc({ scenario: definition, nowMs }), id });

describe("saved what-if scenarios", () => {
  it("creates a body with no id field, version 1, pinned creation time and a created entry", () => {
    const doc = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    expect("id" in doc).toBe(false);
    expect(doc).toMatchObject({ version: 1, archived: false, createdAtMs: 100, updatedAtMs: 100 });
    expect(doc.history).toEqual([{ version: 1, atMs: 100, action: "created", fields: [] }]);
    expect(validateWhatIfScenarioDoc(doc)).toEqual([]);
  });

  it("refuses a body that carries an id", () => {
    const doc = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    expect(validateWhatIfScenarioDoc({ ...doc, id: "x" } as never)).toEqual(["a stored scenario must not carry an id field"]);
  });

  it("edits only the scenario, bumps the version and records which fields changed", () => {
    const edited = editWhatIfScenarioDoc(stored(), { ...definition, durationMonths: 18, name: "Raise + bonus" }, 200)!;
    expect("id" in edited).toBe(false);
    expect(edited).toMatchObject({ name: "Raise + bonus", durationMonths: 18, version: 2, createdAtMs: 100, updatedAtMs: 200 });
    expect(edited.history.at(-1)).toEqual({ version: 2, atMs: 200, action: "edited", fields: ["name", "durationMonths"] });
  });

  it("returns null when nothing changed, so no write happens", () => {
    expect(editWhatIfScenarioDoc(stored(), definition, 200)).toBeNull();
    expect(archiveWhatIfScenarioDoc(stored(), false, 200)).toBeNull();
    expect(rebaseWhatIfScenarioDoc(stored(), reference, 200)).toBeNull();
  });

  it("records a rename separately and keeps the last calculation", () => {
    const calculated = { ...markWhatIfScenarioCalculated(stored(), { mode: "saved", asOfDate: "2026-10-04" }, 150), id: "s1" };
    const renamed = renameWhatIfScenarioDoc(calculated, "New name", 200)!;
    expect(renamed.history.at(-1)).toMatchObject({ action: "renamed", fields: ["name"] });
    expect(renamed.lastCalculated?.atMs).toBe(150);
  });

  it("clears the last calculation when assumptions change", () => {
    const calculated = { ...markWhatIfScenarioCalculated(stored(), { mode: "saved", asOfDate: "2026-10-04" }, 150), id: "s1" };
    const edited = editWhatIfScenarioDoc(calculated, { ...definition, durationMonths: 6 }, 200)!;
    expect(edited.lastCalculated).toBeUndefined();
  });

  it("archives and restores with a traceable version", () => {
    const archived = archiveWhatIfScenarioDoc(stored(), true, 200)!;
    expect(archived).toMatchObject({ archived: true, version: 2 });
    const restored = archiveWhatIfScenarioDoc({ ...archived, id: "s1" }, false, 300)!;
    expect(restored.history.map((h) => h.action)).toEqual(["created", "archived", "restored"]);
  });

  it("duplicates into an independent body: no id, version 1, active, provenance to the source", () => {
    const source = { ...archiveWhatIfScenarioDoc(stored("src"), true, 200)!, id: "src" };
    const copy = duplicateWhatIfScenarioDoc(source, "Copy", 300);
    expect("id" in copy).toBe(false);
    expect(copy).toMatchObject({ name: "Copy", version: 1, archived: false, createdAtMs: 300 });
    expect(copy.history).toEqual([{ version: 1, atMs: 300, action: "duplicated", fields: [], fromId: "src" }]);
    expect(copy.adjustments).not.toBe(source.adjustments);
    expect(copy.reference).not.toBe(source.reference);
  });

  it("caps history so a long-lived scenario cannot grow without bound", () => {
    let current: WhatIfScenario = stored();
    for (let i = 0; i < WHAT_IF_HISTORY_LIMIT + 5; i += 1) {
      current = { ...editWhatIfScenarioDoc(current, { ...definition, name: `Name ${i}` }, 200 + i)!, id: "s1" };
    }
    expect(current.history).toHaveLength(WHAT_IF_HISTORY_LIMIT);
    expect(current.history.at(-1)?.version).toBe(current.version);
    expect(validateWhatIfScenarioDoc((({ id: _id, ...rest }) => rest)(current))).toEqual([]);
  });

  it("applies the explicit baseline rule and stamps the last calculation", () => {
    const today: WhatIfBaselineReference = { ...reference, asOfDate: "2026-11-01", sourceVersions: [{ source: "runway", version: "2" }] };
    expect(whatIfCalculationReference(stored(), today, "saved").asOfDate).toBe("2026-10-04");
    expect(whatIfCalculationReference(stored(), today, "current").asOfDate).toBe("2026-11-01");
    const calc = markWhatIfScenarioCalculated(stored(), { mode: "current", asOfDate: "2026-11-01" }, 500);
    expect(calc.lastCalculated).toEqual({ atMs: 500, engineVersion: WHAT_IF_ENGINE_VERSION, mode: "current", asOfDate: "2026-11-01" });
    expect(calc).toMatchObject({ version: 1, updatedAtMs: 100 });
  });

  it("rebases onto today's reference as a traceable change", () => {
    const today: WhatIfBaselineReference = { ...reference, asOfDate: "2026-11-01" };
    const rebased = rebaseWhatIfScenarioDoc(stored(), today, 600)!;
    expect(rebased.reference.asOfDate).toBe("2026-11-01");
    expect(rebased.history.at(-1)).toMatchObject({ action: "rebased", fields: ["reference"], version: 2 });
  });

  it("reports what changed since the scenario was saved", () => {
    const today: WhatIfBaselineReference = { ...reference, asOfDate: "2026-11-01", sourceVersions: [{ source: "runway", version: "2" }, { source: "calendar", version: "1" }] };
    expect(whatIfRecalculationStatus(stored(), today)).toEqual({
      savedAsOfDate: "2026-10-04",
      currentAsOfDate: "2026-11-01",
      changedSources: ["calendar", "runway"],
      currencyChanged: false,
      engineChanged: false,
      upToDate: false,
    });
    expect(whatIfRecalculationStatus(stored(), reference).upToDate).toBe(true);
  });

  it("reopening reproduces the same engine definition", () => {
    const s = stored("s9");
    expect(toWhatIfScenarioDefinition(s)).toEqual({ ...definition, id: "s9" });
    expect(toWhatIfScenarioDefinition(s)).toEqual(toWhatIfScenarioDefinition(s));
  });

  it("reads snapshots with the document id winning over any stray body id", () => {
    const body = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    expect(whatIfScenarioFromSnapshot("doc-id", { ...body, id: "stray" }).id).toBe("doc-id");
    expect(whatIfScenarioFromSnapshot("d", { ...body, adjustments: undefined }).adjustments).toEqual([]);
  });

  it("lists changed fields only", () => {
    expect(changedWhatIfFields(stored(), { ...stored(), assumptions: [] })).toEqual([]);
  });

  it("sorts active scenarios before archived, then newest first", () => {
    const make = (id: string, archived: boolean, updatedAtMs: number) => ({ ...stored(id, updatedAtMs), archived });
    expect(sortWhatIfScenarios([make("old", false, 1), make("archived", true, 9), make("new", false, 10)]).map((x) => x.id)).toEqual(["new", "old", "archived"]);
  });

  it("rejects invalid timestamps, versions and history", () => {
    const doc = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    expect(validateWhatIfScenarioDoc({ ...doc, createdAtMs: 200, updatedAtMs: 100 })).toContain("updatedAtMs must not precede createdAtMs");
    expect(validateWhatIfScenarioDoc({ ...doc, version: 0 })).toContain("version must be a positive whole number");
    expect(validateWhatIfScenarioDoc({ ...doc, history: [] })).toContain(`history must hold 1 to ${WHAT_IF_HISTORY_LIMIT} entries`);
  });
});
