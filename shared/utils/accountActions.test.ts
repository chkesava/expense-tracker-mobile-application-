import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SECTIONS,
  DEFAULT_ACCOUNT_SECTION,
  buildAccountActions,
  isAccountActionEnabled,
  sectionForAccountAction,
  sectionShowsActivityList,
  type AccountActionId,
} from "./accountActions";

const BANK = { isCreditCard: false, exportAllowed: true };
const CARD = { isCreditCard: true, exportAllowed: true };

function ids(context: Parameters<typeof buildAccountActions>[0]): AccountActionId[] {
  return buildAccountActions(context).map((action) => action.id);
}

function find(
  context: Parameters<typeof buildAccountActions>[0],
  id: AccountActionId
) {
  const action = buildAccountActions(context).find((entry) => entry.id === id);
  if (!action) throw new Error(`no action ${id}`);
  return action;
}

describe("buildAccountActions", () => {
  it("offers every action the ticket names, in a stable order", () => {
    expect(ids(BANK)).toEqual([
      "downloadStatement",
      "exportCsv",
      "reconcile",
      "balanceHistory",
      "documents",
      "notes",
      "settings",
    ]);
  });

  it("offers a credit card the same set", () => {
    expect(ids(CARD)).toEqual(ids(BANK));
  });

  it("never returns duplicate ids", () => {
    const list = ids(CARD);
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("reconcile", () => {
  // A card is reconciled against its statement, a bank account against its own
  // ledger. Same slot, different document, so the label has to say which.
  it("names the statement for a credit card", () => {
    expect(find(CARD, "reconcile").label).toBe("Reconcile statement");
  });

  it("names the account for a bank account", () => {
    expect(find(BANK, "reconcile").label).toBe("Reconcile account");
  });

  it("is available for both", () => {
    expect(isAccountActionEnabled(find(CARD, "reconcile"))).toBe(true);
    expect(isAccountActionEnabled(find(BANK, "reconcile"))).toBe(true);
  });
});

describe("export policy", () => {
  it("enables both exports when policy allows", () => {
    expect(isAccountActionEnabled(find(BANK, "downloadStatement"))).toBe(true);
    expect(isAccountActionEnabled(find(BANK, "exportCsv"))).toBe(true);
  });

  it("disables both exports when policy forbids", () => {
    const off = { ...BANK, exportAllowed: false };
    expect(isAccountActionEnabled(find(off, "downloadStatement"))).toBe(false);
    expect(isAccountActionEnabled(find(off, "exportCsv"))).toBe(false);
  });

  // A missing row reads as a missing feature. Someone whose admin switched
  // export off should be told that, not left hunting for last week's button.
  it("still lists the disabled exports, with a reason", () => {
    const off = { ...BANK, exportAllowed: false };
    expect(ids(off)).toContain("downloadStatement");
    expect(ids(off)).toContain("exportCsv");
    expect(find(off, "downloadStatement").disabledReason).toMatch(/system policy/i);
  });

  it("leaves every other action alone when export is off", () => {
    const off = { ...CARD, exportAllowed: false };
    const others = buildAccountActions(off).filter(
      (action) => action.id !== "downloadStatement" && action.id !== "exportCsv"
    );
    expect(others.every(isAccountActionEnabled)).toBe(true);
  });
});

describe("balance history on a credit card", () => {
  // There is no balance to chart for a liability, but the card itself explains
  // that. A greyed-out row would replace the explanation with a dead end.
  it("stays available so the card can give the reason", () => {
    expect(isAccountActionEnabled(find(CARD, "balanceHistory"))).toBe(true);
  });
});

describe("targets", () => {
  it.each([
    ["balanceHistory", "insights"],
    ["documents", "overview"],
    ["notes", "overview"],
  ] as const)("routes %s to the %s section", (id, expected) => {
    expect(sectionForAccountAction(find(BANK, id))).toBe(expected);
  });

  it.each(["downloadStatement", "exportCsv", "reconcile", "settings"] as const)(
    "opens %s as a sheet rather than a section",
    (id) => {
      expect(sectionForAccountAction(find(BANK, id))).toBeNull();
      expect(find(BANK, id).target.kind).toBe("modal");
    }
  );

  // Every navigating action must land somewhere that exists.
  it("only targets sections the screen actually has", () => {
    const known = new Set(ACCOUNT_SECTIONS.map((entry) => entry.id));
    for (const action of buildAccountActions(CARD)) {
      const target = sectionForAccountAction(action);
      if (target) expect(known.has(target)).toBe(true);
    }
  });
});

describe("sections", () => {
  it("opens on Overview", () => {
    expect(DEFAULT_ACCOUNT_SECTION).toBe("overview");
    expect(ACCOUNT_SECTIONS[0].id).toBe("overview");
  });

  it("lists the three sections with labels", () => {
    expect(ACCOUNT_SECTIONS.map((entry) => entry.id)).toEqual([
      "overview",
      "transactions",
      "insights",
    ]);
    expect(ACCOUNT_SECTIONS.every((entry) => entry.label.length > 0)).toBe(true);
  });

  // The activity list is the one unbounded thing on the screen.
  it("renders rows only on Transactions", () => {
    expect(sectionShowsActivityList("transactions")).toBe(true);
    expect(sectionShowsActivityList("overview")).toBe(false);
    expect(sectionShowsActivityList("insights")).toBe(false);
  });

  it("does not render rows on the section the screen opens with", () => {
    expect(sectionShowsActivityList(DEFAULT_ACCOUNT_SECTION)).toBe(false);
  });
});
