/**
 * Contract test: the enum lists inside `feeReviewWellFormed` in
 * `firestore.rules` must match the TS model. Rules cannot import TS, so a
 * type added on one side only would either be refused on write or accepted
 * unvalidated. This reads the rules text; the emulator suite
 * (firestore/feeReviews.rules.test.ts) exercises the rules themselves.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FEE_ROLES, FEE_TYPE_IDS } from "../types/fee";
import { TRANSACTION_KINDS } from "./transactionRef";
import { FEE_REVIEW_HISTORY_LIMIT, FEE_REVIEW_ID_SEPARATOR } from "./feeModel";

const RULES = readFileSync("firestore.rules", "utf8");

function ruleList(fn: string): string[] {
  const match = RULES.match(new RegExp(`function ${fn}\\(\\) \\{\\s*return \\[([^\\]]*)\\];`));
  if (!match) throw new Error(`function ${fn}() not found in firestore.rules`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("feeReviews rules ↔ TS model", () => {
  it("allows exactly the TS fee type ids", () => {
    expect(ruleList("feeTypeIds")).toEqual([...FEE_TYPE_IDS]);
  });

  it("allows exactly the TS fee roles", () => {
    expect(ruleList("feeRoles")).toEqual([...FEE_ROLES]);
  });

  it("allows exactly the ledger transaction kinds", () => {
    expect(ruleList("feeSourceKinds")).toEqual([...TRANSACTION_KINDS]);
  });

  it("caps correction history at the TS limit", () => {
    expect(RULES).toContain(`d.history is list && d.history.size() <= ${FEE_REVIEW_HISTORY_LIMIT}`);
  });

  it("builds the doc id with the same separator as feeReviewDocId", () => {
    expect(RULES).toContain(`reviewId == d.sourceKind + '${FEE_REVIEW_ID_SEPARATOR}' + d.sourceId`);
  });
});
