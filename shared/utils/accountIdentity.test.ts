import { describe, expect, it } from "vitest";

import {
  inferInstitutionFromDisplayName,
  lookupInstitution,
} from "../data/institutions";
import {
  accountMatchesSmsHint,
  buildAccountWritePayload,
  hydrateAccountIdentity,
  normalizeLast4,
  toAccountIdentity,
} from "./accountIdentity";
import { canonicalAccountTypeId } from "./accountKind";

describe("canonicalAccountTypeId", () => {
  it("maps existing account type names without changing ledger kind", () => {
    expect(canonicalAccountTypeId("Credit Card")).toBe("credit_card");
    expect(canonicalAccountTypeId("Bank")).toBe("bank");
    expect(canonicalAccountTypeId("Cash")).toBe("cash");
    expect(canonicalAccountTypeId("Wallet")).toBe("other");
  });
});

describe("normalizeLast4", () => {
  it("extracts the last four digits from masks", () => {
    expect(normalizeLast4("•••• 4521")).toBe("4521");
    expect(normalizeLast4("XX4521")).toBe("4521");
    expect(normalizeLast4("12")).toBeUndefined();
  });
});

describe("hydrateAccountIdentity", () => {
  it("keeps legacy accounts readable and fills identity defaults", () => {
    const hydrated = hydrateAccountIdentity(
      {
        id: "acc-1",
        name: "Super Money Credit Card",
        typeId: "type-cc",
        accountNumber: "XX4521",
      },
      "Credit Card"
    );

    expect(hydrated.name).toBe("Super Money Credit Card");
    expect(hydrated.displayName).toBe("Super Money Credit Card");
    expect(hydrated.typeId).toBe("type-cc");
    expect(hydrated.accountTypeId).toBe("credit_card");
    expect(hydrated.last4).toBe("4521");
    expect(hydrated.institutionId).toBe("super_money");
    expect(hydrated.institutionName).toBe("Super Money");
    expect(hydrated.institutionType).toBe("nbfc");
    expect(hydrated.smsMatchingEnabled).toBe(true);
  });

  it("does not invent an institution from an unrelated display name", () => {
    const hydrated = hydrateAccountIdentity(
      {
        id: "acc-2",
        name: "Primary Bank",
        typeId: "type-bank",
      },
      "Bank"
    );
    expect(hydrated.displayName).toBe("Primary Bank");
    expect(hydrated.accountTypeId).toBe("bank");
    expect(hydrated.institutionId).toBeUndefined();
    expect(hydrated.smsMatchingEnabled).toBe(true);
  });

  it("disables SMS matching for cash by default", () => {
    const hydrated = hydrateAccountIdentity(
      { id: "acc-3", name: "Wallet cash", typeId: "type-cash" },
      "Cash"
    );
    expect(hydrated.accountTypeId).toBe("cash");
    expect(hydrated.smsMatchingEnabled).toBe(false);
  });
});

describe("institution identity vs display name", () => {
  it("maps Super Money Credit Card to Super Money, not the full label", () => {
    const inferred = inferInstitutionFromDisplayName("Super Money Credit Card");
    expect(inferred?.id).toBe("super_money");
    expect(lookupInstitution("Super Card")?.id).toBe("super_money");
  });

  it("resolves Super Card via institution aliases, not displayName alone", () => {
    const account = hydrateAccountIdentity(
      {
        id: "acc-sm",
        name: "Super Money Credit Card",
        typeId: "type-cc",
        last4: "4521",
      },
      "Credit Card"
    );
    const identity = toAccountIdentity(account, "Credit Card");
    expect(identity.matchKeys).toContain("supercard");
    expect(identity.matchKeys).not.toContain(
      "supermoneycreditcard"
    );
    expect(accountMatchesSmsHint(account, "Super Card", "Credit Card")).toBe(
      true
    );
  });

  it("does not match an SMS that only equals the display name", () => {
    const account = {
      id: "acc-x",
      name: "Grocery nick",
      typeId: "type-cc",
      displayName: "Grocery nick",
      accountTypeId: "credit_card" as const,
      smsMatchingEnabled: true,
    };
    expect(accountMatchesSmsHint(account, "Grocery nick", "Credit Card")).toBe(
      false
    );
  });
});

describe("buildAccountWritePayload", () => {
  it("persists structured identity including last4", () => {
    const payload = buildAccountWritePayload({
      name: "Super Money Credit Card",
      typeId: "type-cc",
      typeName: "Credit Card",
      extras: {
        last4: "4521",
        institutionName: "Super Money",
        color: "#2563EB",
      },
    });

    expect(payload).toMatchObject({
      name: "Super Money Credit Card",
      displayName: "Super Money Credit Card",
      typeId: "type-cc",
      accountTypeId: "credit_card",
      last4: "4521",
      accountNumber: "4521",
      institutionId: "super_money",
      institutionName: "Super Money",
      institutionType: "nbfc",
      smsMatchingEnabled: true,
      color: "#2563EB",
    });
  });
});
