import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  accountActivityFilterLabels,
  describeAccountActivityFilters,
} from "./accountActivityFilterLabels";
import {
  createEmptyAccountActivityFilters,
  type AccountActivityFilters,
} from "./accountActivityFilters";

function filters(over: Partial<AccountActivityFilters> = {}): AccountActivityFilters {
  return { ...createEmptyAccountActivityFilters(), ...over };
}

describe("account activity filter labels (SPENDLY-113)", () => {
  it("describes nothing when nothing is applied", () => {
    expect(describeAccountActivityFilters(filters())).toEqual([]);
    expect(accountActivityFilterLabels(filters())).toEqual([]);
  });

  it("produces the chips in exactly the order TransactionFilters pushed them", () => {
    // Order is load-bearing: it is the on-screen chip order, and the export
    // header lists them the same way so the two can be compared at a glance.
    // This literal is transcribed from the component as it stood before the
    // extraction.
    const all = filters({
      kind: "expense",
      specialKinds: ["refunds", "investments", "bills"],
      accounts: ["HDFC"],
      categories: ["Food"],
      counterparties: ["Ravi"],
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      minAmount: "100",
      maxAmount: "5000",
      tags: ["work"],
      statuses: ["audited", "unaudited"],
    });

    expect(describeAccountActivityFilters(all)).toEqual([
      { id: "kind", label: "Expense", field: "kind" },
      {
        id: "special-refunds",
        label: "Refunds & cashback",
        field: "specialKinds",
        value: "refunds",
      },
      {
        id: "special-investments",
        label: "Investments",
        field: "specialKinds",
        value: "investments",
      },
      {
        id: "special-bills",
        label: "Bills & payments",
        field: "specialKinds",
        value: "bills",
      },
      { id: "account-HDFC", label: "Account: HDFC", field: "accounts", value: "HDFC" },
      {
        id: "category-Food",
        label: "Category: Food",
        field: "categories",
        value: "Food",
      },
      {
        id: "counterparty-Ravi",
        label: "With: Ravi",
        field: "counterparties",
        value: "Ravi",
      },
      { id: "from-date", label: "From: 2026-09-01", field: "fromDate" },
      { id: "to-date", label: "To: 2026-09-30", field: "toDate" },
      { id: "min-amount", label: "Min: 100", field: "minAmount" },
      { id: "max-amount", label: "Max: 5000", field: "maxAmount" },
      { id: "tag-work", label: "Tag: work", field: "tags", value: "work" },
      { id: "status-audited", label: "Audited", field: "statuses", value: "audited" },
      {
        id: "status-unaudited",
        label: "Not audited",
        field: "statuses",
        value: "unaudited",
      },
    ]);
  });

  it("labels the accounts facet Account: and the counterparties facet With:, never the same word", () => {
    // `accountName` is the account a row was posted to; `counterparty` is the
    // other side of a movement. Conflating them in a label would mislabel a
    // financial field on one of the two screens that share this bar.
    const labels = accountActivityFilterLabels(
      filters({ accounts: ["HDFC"], counterparties: ["Ravi"] })
    );
    expect(labels).toEqual(["Account: HDFC", "With: Ravi"]);
  });

  it("says nothing about the kind when it is 'all'", () => {
    expect(describeAccountActivityFilters(filters({ kind: "all" }))).toEqual([]);
  });

  it("labels each kind", () => {
    for (const [kind, label] of [
      ["income", "Income"],
      ["expense", "Expense"],
      ["transfers", "Transfers"],
    ] as const) {
      expect(accountActivityFilterLabels(filters({ kind }))).toEqual([label]);
    }
  });

  it("emits one chip per value in a multi-value facet", () => {
    const labels = accountActivityFilterLabels(
      filters({ tags: ["work", "travel", "team"] })
    );
    expect(labels).toEqual(["Tag: work", "Tag: travel", "Tag: team"]);
  });

  it("treats an empty date or amount string as not applied", () => {
    expect(
      describeAccountActivityFilters(
        filters({ fromDate: "", toDate: "", minAmount: "", maxAmount: "" })
      )
    ).toEqual([]);
  });

  it('keeps a "0" minimum, which is a real filter and a falsy-looking string', () => {
    expect(accountActivityFilterLabels(filters({ minAmount: "0" }))).toEqual([
      "Min: 0",
    ]);
  });

  it("carries the value needed to remove just that chip", () => {
    const [chip] = describeAccountActivityFilters(filters({ categories: ["Food"] }));
    expect(chip.field).toBe("categories");
    expect(chip.value).toBe("Food");
  });

  it("gives each chip a distinct id", () => {
    const chips = describeAccountActivityFilters(
      filters({ tags: ["a", "b"], categories: ["a"], accounts: ["a"] })
    );
    expect(new Set(chips.map((chip) => chip.id)).size).toBe(chips.length);
  });

  it("does not mutate the filters it describes", () => {
    const input = Object.freeze(filters({ tags: ["work"] }));
    expect(() => describeAccountActivityFilters(input)).not.toThrow();
  });

  it("leaves no second copy of the labels inside TransactionFilters", () => {
    // `components/**` is outside the vitest include, so this source scan is the
    // only reachable proof that the chips and the export header cannot drift
    // apart into two different vocabularies.
    const source = readFileSync(
      fileURLToPath(
        new URL("../../components/accounts/TransactionFilters.tsx", import.meta.url)
      ),
      "utf8"
    );
    expect(source).toContain("describeAccountActivityFilters(");
    for (const label of [
      "Refunds & cashback",
      "Bills & payments",
      "Account: ",
      "Category: ",
      "With: ",
      "Not audited",
    ]) {
      expect(source).not.toContain(label);
    }
  });
});
