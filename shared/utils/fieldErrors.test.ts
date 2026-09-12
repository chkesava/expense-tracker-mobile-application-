import { describe, expect, it } from "vitest";

import { fieldErrorsFromIssues } from "@/shared/utils/fieldErrors";

describe("fieldErrorsFromIssues", () => {
  it("maps zod issues by their leading path segment", () => {
    expect(
      fieldErrorsFromIssues([
        { path: ["uan"], message: "UAN must be 12 digits" },
        { path: ["name"], message: "Required" },
      ])
    ).toEqual({ uan: "UAN must be 12 digits", name: "Required" });
  });

  it("maps EPF domain issues by their field", () => {
    // EpfTransferIssue / EpfReconciliationIssue carry `field`, not `path`.
    expect(
      fieldErrorsFromIssues([
        { field: "amount", message: "More than the available balance" },
        { field: "date", message: "Cannot be in the future" },
      ])
    ).toEqual({ amount: "More than the available balance", date: "Cannot be in the future" });
  });

  it("handles both shapes in one list", () => {
    expect(
      fieldErrorsFromIssues([
        { path: ["amount"], message: "from zod" },
        { field: "date", message: "from the domain" },
      ])
    ).toEqual({ amount: "from zod", date: "from the domain" });
  });

  it("drops issues with no field — they have nowhere to render", () => {
    // A form-level zod refinement reports an empty path.
    expect(fieldErrorsFromIssues([{ path: [], message: "form-level" }])).toEqual({});
    expect(fieldErrorsFromIssues([{ field: undefined, message: "no field" }])).toEqual({});
  });

  it("lets a later issue win for the same field, as the eight copies did", () => {
    expect(
      fieldErrorsFromIssues([
        { path: ["amount"], message: "first" },
        { path: ["amount"], message: "second" },
      ])
    ).toEqual({ amount: "second" });
  });

  it("keeps a leading index of 0, which a truthiness check would drop", () => {
    // No EPF schema has a top-level array today. The copies this replaces used
    // `if (issue.path[0])`, which would have silently lost this.
    expect(fieldErrorsFromIssues([{ path: [0], message: "first row" }])).toEqual({
      "0": "first row",
    });
  });

  it("returns an empty record for no issues", () => {
    expect(fieldErrorsFromIssues([])).toEqual({});
  });
});
