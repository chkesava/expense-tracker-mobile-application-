import { describe, expect, it } from "vitest";

import type { Account } from "../types/expense";
import {
  buildAccountWritePayload,
  getAccountConfigurationStatus,
  hydrateAccountIdentity,
  summarizeAccountIdentityMigration,
} from "./accountIdentity";

function simulateUpdateWrite(
  existing: Account,
  updates: Partial<Account>,
  typeName: string
) {
  const merged: Account = {
    ...existing,
    ...updates,
  };
  const hydrated = hydrateAccountIdentity(merged, typeName);
  return buildAccountWritePayload({
    name: hydrated.name,
    typeId: hydrated.typeId,
    typeName,
    extras: hydrated,
  });
}

describe("existing account identity migration", () => {
  it("preserves Firestore account id, typeId, and display name", () => {
    const existing: Account = {
      id: "acc-legacy-1",
      name: "Super Money Credit Card",
      typeId: "type-cc",
      openingBalance: 12000,
      color: "#2563EB",
    };

    const hydrated = hydrateAccountIdentity(existing, "Credit Card");
    expect(hydrated.id).toBe("acc-legacy-1");
    expect(hydrated.typeId).toBe("type-cc");
    expect(hydrated.name).toBe("Super Money Credit Card");
    expect(hydrated.displayName).toBe("Super Money Credit Card");
    expect(hydrated.openingBalance).toBe(12000);
    expect(hydrated.color).toBe("#2563EB");
  });

  it("does not blindly map Super Money Credit Card to super_money", () => {
    const hydrated = hydrateAccountIdentity(
      {
        id: "acc-legacy-1",
        name: "Super Money Credit Card",
        typeId: "type-cc",
      },
      "Credit Card"
    );

    expect(hydrated.institutionId).toBeUndefined();
    expect(hydrated.smsMatchingEnabled).toBe(false);
    expect(getAccountConfigurationStatus(hydrated, "Credit Card")).toBe(
      "NEEDS_INSTITUTION"
    );
  });

  it("is idempotent when hydrated twice", () => {
    const existing: Account = {
      id: "acc-legacy-1",
      name: "Super Money Credit Card",
      typeId: "type-cc",
      accountNumber: "XX4521",
    };
    const once = hydrateAccountIdentity(existing, "Credit Card");
    const twice = hydrateAccountIdentity(once, "Credit Card");
    expect(twice).toEqual(once);
  });

  it("does not put an account id on the Firestore write payload", () => {
    const payload = simulateUpdateWrite(
      {
        id: "acc-legacy-1",
        name: "Primary Bank",
        typeId: "type-bank",
        openingBalance: 5000,
      },
      { color: "#111111" },
      "Bank"
    );

    expect(payload).not.toHaveProperty("id");
    expect(payload.typeId).toBe("type-bank");
    expect(payload.name).toBe("Primary Bank");
    expect(payload.displayName).toBe("Primary Bank");
    expect(payload.openingBalance).toBe(5000);
    expect(payload.institutionId).toBeNull();
    expect(payload.smsMatchingEnabled).toBe(false);
  });

  it("keeps last4 when resuming a partially configured account", () => {
    const existing: Account = {
      id: "acc-partial",
      name: "HDFC Salary",
      typeId: "type-bank",
      displayName: "HDFC Salary",
      accountTypeId: "bank",
      last4: "7788",
      smsMatchingEnabled: false,
    };
    const hydrated = hydrateAccountIdentity(existing, "Bank");
    expect(hydrated.id).toBe("acc-partial");
    expect(hydrated.last4).toBe("7788");
    expect(hydrated.institutionId).toBeUndefined();
    expect(getAccountConfigurationStatus(hydrated, "Bank")).toBe(
      "NEEDS_INSTITUTION"
    );

    const payload = simulateUpdateWrite(existing, {}, "Bank");
    expect(payload.last4).toBe("7788");
    expect(payload.institutionId).toBeNull();
    expect(payload.smsMatchingEnabled).toBe(false);
  });

  it("skips already-configured accounts without changing identity", () => {
    const existing: Account = {
      id: "acc-sm",
      name: "Travel card",
      typeId: "type-cc",
      displayName: "Travel card",
      accountTypeId: "credit_card",
      institutionId: "super_money",
      last4: "4521",
      smsMatchingEnabled: true,
    };
    const first = simulateUpdateWrite(existing, {}, "Credit Card");
    const second = simulateUpdateWrite(
      { ...existing, ...first, id: existing.id, typeId: existing.typeId } as Account,
      {},
      "Credit Card"
    );

    expect(first.institutionId).toBe("super_money");
    expect(first.smsMatchingEnabled).toBe(true);
    expect(second).toEqual(first);
    expect(getAccountConfigurationStatus(existing, "Credit Card")).toBe(
      "CONFIGURED"
    );
  });

  it("classifies configuration statuses without inventing persisted fields", () => {
    expect(getAccountConfigurationStatus({ typeId: "" }, "Credit Card")).toBe(
      "NEEDS_ACCOUNT_TYPE"
    );
    expect(
      getAccountConfigurationStatus({ typeId: "type-cash" }, "Cash")
    ).toBe("NOT_SUPPORTED");
    expect(
      getAccountConfigurationStatus(
        {
          typeId: "type-cc",
          institutionId: "super_money",
        },
        "Credit Card"
      )
    ).toBe("NEEDS_LAST4");
  });

  it("reports counts only and never includes account secrets", () => {
    const accounts: Account[] = [
      {
        id: "acc-1",
        name: "Super Money Credit Card",
        typeId: "type-cc",
      },
      {
        id: "acc-2",
        name: "Travel card",
        typeId: "type-cc",
        accountTypeId: "credit_card",
        institutionId: "super_money",
        last4: "4521",
      },
      { id: "acc-3", name: "Wallet cash", typeId: "type-cash" },
    ];
    const report = summarizeAccountIdentityMigration(
      accounts,
      new Map([
        ["type-cc", "Credit Card"],
        ["type-cash", "Cash"],
      ])
    );

    expect(report.scanned).toBe(3);
    expect(report.alreadyMigrated).toBe(1);
    expect(report.migrated).toBe(1);
    expect(report.byStatus.NEEDS_INSTITUTION).toBe(1);
    expect(report.byStatus.CONFIGURED).toBe(1);
    expect(report.byStatus.NOT_SUPPORTED).toBe(1);
    expect(report.requiringConfiguration).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.errors).toBe(0);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Super Money");
    expect(serialized).not.toContain("4521");
    expect(serialized).not.toContain("Travel card");
  });
});
