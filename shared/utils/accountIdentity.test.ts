import { describe, expect, it } from "vitest";

import {
  buildAccountWritePayload,
  formatCreditCardHeaderLine,
  hydrateAccountIdentity,
  normalizeLast4,
  suggestedAccountDisplayName,
} from "./accountIdentity";
import { canonicalAccountTypeId } from "./accountKind";
import { getInstitutionById } from "../data/institutions";

describe("canonicalAccountTypeId", () => {
  it("maps existing account type names without changing ledger kind", () => {
    expect(canonicalAccountTypeId("Credit Card")).toBe("credit_card");
    expect(canonicalAccountTypeId("Bank")).toBe("bank");
    expect(canonicalAccountTypeId("Cash")).toBe("cash");
    expect(canonicalAccountTypeId("Wallet")).toBe("wallet");
  });
});

describe("normalizeLast4", () => {
  it("extracts the last four digits from masks", () => {
    expect(normalizeLast4("•••• 4521")).toBe("4521");
    expect(normalizeLast4("XX4521")).toBe("4521");
    expect(normalizeLast4("12")).toBeUndefined();
  });

  it("keeps only the last four digits from a full card number", () => {
    expect(normalizeLast4("4111222233334521")).toBe("4521");
    expect(normalizeLast4("4111 2222 3333 4521")).toBe("4521");
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
  });

  it("derives the cash account type", () => {
    const hydrated = hydrateAccountIdentity(
      { id: "acc-3", name: "Wallet cash", typeId: "type-cash" },
      "Cash"
    );
    expect(hydrated.accountTypeId).toBe("cash");
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
      color: "#2563EB",
    });
  });

  it("never persists a full card number", () => {
    const payload = buildAccountWritePayload({
      name: "Travel card",
      typeId: "type-cc",
      typeName: "Credit Card",
      extras: {
        accountNumber: "4111222233334521",
        institutionId: "super_money",
      },
    });

    expect(payload.last4).toBe("4521");
    expect(payload.accountNumber).toBe("4521");
    expect(JSON.stringify(payload)).not.toContain("4111222233334521");
  });

  it("does not save an arbitrary institution string for a credit card", () => {
    const payload = buildAccountWritePayload({
      name: "My Secret Card",
      typeId: "type-cc",
      typeName: "Credit Card",
      extras: {
        institutionName: "Totally Made Up Bank",
      },
    });

    expect(payload.institutionId).toBeNull();
    expect(payload.institutionName).toBeNull();
  });
});

describe("formatCreditCardHeaderLine", () => {
  it("shows masked last4 without inventing a card network", () => {
    expect(
      formatCreditCardHeaderLine({
        last4: "4567",
      })
    ).toBe("•••• 4567");
  });

  it("includes catalog institution name when present", () => {
    expect(
      formatCreditCardHeaderLine({
        institutionName: "Super Money",
        last4: "4521",
      })
    ).toBe("Super Money  •••• 4521");
  });

  it("falls back to Credit Card when identity is missing", () => {
    expect(formatCreditCardHeaderLine({})).toBe("Credit Card");
  });
});
