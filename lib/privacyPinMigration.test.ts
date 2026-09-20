import { describe, expect, it } from "vitest";

import {
  planIsEmpty,
  planPinMigration,
} from "@/lib/privacyPinMigration";

const NO_VAULT = { hasReal: false, hasDuress: false };
const HASH = "a".repeat(64);

describe("planPinMigration", () => {
  it("does nothing without a user doc", () => {
    // A failed read must never look like "no PIN" — that would disable the lock.
    expect(planIsEmpty(planPinMigration({ docData: null, vault: NO_VAULT }))).toBe(
      true,
    );
  });

  it("does nothing for a user who never set a PIN", () => {
    const plan = planPinMigration({
      docData: { currency: "INR" },
      vault: NO_VAULT,
    });
    expect(planIsEmpty(plan)).toBe(true);
  });

  it("imports a top-level hashed pin and clears the field", () => {
    const plan = planPinMigration({
      docData: { privacyPin: HASH },
      vault: NO_VAULT,
    });
    expect(plan.importReal).toBe(HASH);
    expect(plan.firestoreFieldsToClear).toEqual(["privacyPin"]);
  });

  it("imports a legacy plaintext pin", () => {
    const plan = planPinMigration({
      docData: { privacyPin: "1234" },
      vault: NO_VAULT,
    });
    expect(plan.importReal).toBe("1234");
  });

  it("finds a pin nested under settings", () => {
    // Written by an older web build. Missing this leaves a hash in Firestore.
    const plan = planPinMigration({
      docData: { settings: { privacyPin: HASH, fakePin: "5678" } },
      vault: NO_VAULT,
    });
    expect(plan.importReal).toBe(HASH);
    expect(plan.importDuress).toBe("5678");
    expect(plan.firestoreFieldsToClear).toEqual([
      "settings.privacyPin",
      "settings.fakePin",
    ]);
  });

  it("prefers the top-level field over the nested one", () => {
    const plan = planPinMigration({
      docData: { privacyPin: HASH, settings: { privacyPin: "0000" } },
      vault: NO_VAULT,
    });
    expect(plan.importReal).toBe(HASH);
    expect(plan.firestoreFieldsToClear).toEqual(["privacyPin"]);
  });

  it("brings the duress pin across with the real one", () => {
    const plan = planPinMigration({
      docData: { privacyPin: HASH, fakePin: "5678" },
      vault: NO_VAULT,
    });
    expect(plan.importReal).toBe(HASH);
    expect(plan.importDuress).toBe("5678");
  });

  it("refuses a duress pin with no real pin anywhere", () => {
    const plan = planPinMigration({
      docData: { fakePin: "5678" },
      vault: NO_VAULT,
    });
    expect(plan.importDuress).toBeUndefined();
    // The stray field is still cleared — it is a hash in Firestore either way.
    expect(plan.firestoreFieldsToClear).toEqual(["fakePin"]);
  });

  it("brings a duress pin across when the vault already holds the real one", () => {
    const plan = planPinMigration({
      docData: { fakePin: "5678" },
      vault: { hasReal: true, hasDuress: false },
    });
    expect(plan.importDuress).toBe("5678");
  });

  it("imports nothing when this device already has both", () => {
    // Re-run after a crash: the vault is the truth, Firestore is the leftover.
    const plan = planPinMigration({
      docData: { privacyPin: HASH, fakePin: "5678" },
      vault: { hasReal: true, hasDuress: true },
    });
    expect(plan.importReal).toBeUndefined();
    expect(plan.importDuress).toBeUndefined();
    expect(plan.firestoreFieldsToClear).toEqual(["privacyPin", "fakePin"]);
  });

  it("still clears Firestore when there is nothing left to import", () => {
    const plan = planPinMigration({
      docData: { privacyPin: HASH },
      vault: { hasReal: true, hasDuress: false },
    });
    expect(planIsEmpty(plan)).toBe(false);
  });

  it("asks for nothing once Firestore is clean", () => {
    // The steady state after a successful migration: no repeated writes.
    const plan = planPinMigration({
      docData: { currency: "INR" },
      vault: { hasReal: true, hasDuress: true },
    });
    expect(planIsEmpty(plan)).toBe(true);
  });

  it("ignores empty-string fields", () => {
    // How "remove PIN" used to write a removal.
    const plan = planPinMigration({
      docData: { privacyPin: "", fakePin: "" },
      vault: NO_VAULT,
    });
    expect(planIsEmpty(plan)).toBe(true);
  });

  it("ignores a non-string field", () => {
    const plan = planPinMigration({
      docData: { privacyPin: 1234, fakePin: null },
      vault: NO_VAULT,
    });
    expect(planIsEmpty(plan)).toBe(true);
  });
});
