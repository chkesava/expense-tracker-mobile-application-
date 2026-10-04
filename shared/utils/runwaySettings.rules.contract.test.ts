import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BASELINE_WINDOWS } from "./runwayBaseline";
import { DEFAULT_RUNWAY_SETTINGS, RUNWAY_MAX_THRESHOLD_AMOUNT, RUNWAY_MAX_THRESHOLD_MONTHS, RUNWAY_THRESHOLD_KINDS, runwaySettingsDoc } from "./runwaySettings";
import { RUNWAY_MODES } from "../types/runway";

/** SPENDLY-210 — the settings document and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function runwaySettingsWellFormed("), rules.indexOf("match /runwaySettings/"));
const list = (re: RegExp) => [...(body.match(re)?.[1] ?? "").matchAll(/'([^']+)'|(\d+)/g)].map((m) => m[1] ?? Number(m[2]));

describe("runway settings rules contract", () => {
  it("allows exactly the fields the app writes", () => {
    expect((list(/hasOnly\(\[([^\]]*)\]\)/) as string[]).sort()).toEqual(Object.keys(runwaySettingsDoc(DEFAULT_RUNWAY_SETTINGS, 1)).sort());
  });

  it("matches the enums", () => {
    expect(list(/d\.mode in \[([^\]]*)\]/)).toEqual([...RUNWAY_MODES]);
    expect(list(/d\.thresholdKind in \[([^\]]*)\]/)).toEqual([...RUNWAY_THRESHOLD_KINDS]);
    expect(list(/d\.windowMonths in \[([^\]]*)\]/)).toEqual([...BASELINE_WINDOWS]);
    expect(list(/d\.method in \[([^\]]*)\]/)).toEqual(["average", "median"]);
  });

  it("matches the bounds", () => {
    expect(body).toContain(`d.thresholdAmount <= ${RUNWAY_MAX_THRESHOLD_AMOUNT}`);
    expect(body).toContain(`d.thresholdMonths <= ${RUNWAY_MAX_THRESHOLD_MONTHS}`);
    expect(body).toContain("d.projectionMonths <= 24");
  });
});
