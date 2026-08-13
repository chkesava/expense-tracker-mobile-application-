import { describe, expect, it } from "vitest";

import {
  accountMatchesSmsHint,
  buildAccountWritePayload,
  hydrateAccountIdentity,
  normalizeLast4,
  smsMatchingUnconfiguredLabel,
  suggestedAccountDisplayName,
  toAccountIdentity,
} from "./accountIdentity";
import { canonicalAccountTypeId } from "./accountKind";
import { getInstitutionById } from "../data/institutions";

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
  it("keeps legacy accounts readable without inventing a catalog institution", () => {
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
    expect(hydrated.institutionId).toBeUndefined();
    expect(hydrated.smsMatchingEnabled).toBe(false);
    expect(smsMatchingUnconfiguredLabel(hydrated, "Credit Card")).toBe(
      "SMS matching not configured"
    );
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
    expect(smsMatchingUnconfiguredLabel(hydrated, "Bank")).toBe(
      "SMS matching not configured"
    );
  });

  it("keeps a stored catalog institution on hydrate", () => {
    const hydrated = hydrateAccountIdentity(
      {
        id: "acc-sm",
        name: "Travel card",
        typeId: "type-cc",
        institutionId: "super_money",
        last4: "4521",
      },
      "Credit Card"
    );
    expect(hydrated.institutionId).toBe("super_money");
    expect(hydrated.institutionName).toBe("Super Money");
    expect(smsMatchingUnconfiguredLabel(hydrated, "Credit Card")).toBeNull();
  });

  it("disables SMS matching for cash by default", () => {
    const hydrated = hydrateAccountIdentity(
      { id: "acc-3", name: "Wallet cash", typeId: "type-cash" },
      "Cash"
    );
    expect(hydrated.accountTypeId).toBe("cash");
    expect(hydrated.smsMatchingEnabled).toBe(false);
    expect(smsMatchingUnconfiguredLabel(hydrated, "Cash")).toBeNull();
  });
});

describe("institution identity vs display name", () => {
  it("resolves Super Card via catalog aliases, not displayName alone", () => {
    const account = hydrateAccountIdentity(
      {
        id: "acc-sm",
        name: "Super Money Credit Card",
        typeId: "type-cc",
        institutionId: "super_money",
        last4: "4521",
      },
      "Credit Card"
    );
    const identity = toAccountIdentity(account, "Credit Card");
    expect(identity.matchKeys).toContain("supercard");
    expect(identity.matchKeys).not.toContain("supermoneycreditcard");
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

  it("does not match last4 without a catalog institution", () => {
    const account = {
      id: "acc-l4",
      name: "Travel card",
      typeId: "type-cc",
      accountTypeId: "credit_card" as const,
      last4: "4521",
      smsMatchingEnabled: true,
    };
    expect(accountMatchesSmsHint(account, "spent on XX4521", "Credit Card")).toBe(
      false
    );
  });
});

describe("suggestedAccountDisplayName", () => {
  it("keeps institution identity separate from the optional display label", () => {
    const institution = getInstitutionById("super_money");
    expect(suggestedAccountDisplayName(institution, "credit_card")).toBe(
      "Super Money Credit Card"
    );
  });
});

describe("buildAccountWritePayload", () => {
  it("persists structured identity only from a catalog institutionId", () => {
    const payload = buildAccountWritePayload({
      name: "Super Money Credit Card",
      typeId: "type-cc",
      typeName: "Credit Card",
      extras: {
        last4: "4521",
        institutionId: "super_money",
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

  it("does not save an arbitrary institution string for a credit card", () => {
    const payload = buildAccountWritePayload({
      name: "My Secret Card",
      typeId: "type-cc",
      typeName: "Credit Card",
      extras: {
        institutionName: "Totally Made Up Bank",
        smsMatchingEnabled: true,
      },
    });

    expect(payload.institutionId).toBeNull();
    expect(payload.institutionName).toBeNull();
    expect(payload.smsMatchingEnabled).toBe(false);
  });
});
