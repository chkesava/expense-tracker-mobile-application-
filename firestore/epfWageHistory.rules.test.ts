import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-389: effective-dated EPF wage changes.
 *
 * `establishmentId`/`effectiveFromMonth`/`createdAtMs` are pinned on update —
 * the same `hasOnly` + pinned-field pattern `merchantOverrides` uses — so a
 * wage change cannot be silently repointed at a different establishment or
 * month after it has been created.
 */

const OWNER = "wage-owner";
const OTHER = "wage-other";
let env: RulesTestEnvironment;

const valid = {
  establishmentId: "est-1",
  effectiveFromMonth: "2026-09",
  wage: 25000,
  epsEligible: true,
  rulesVersion: "2014-09",
  createdAtMs: 1000,
  updatedAtMs: 1000,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "spendly-epf-wage-history",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", OWNER, "epfWageHistory", "wh-1"), valid);
  });
});

describe("epfWageHistory rules", () => {
  it("owner can list and create a well-formed wage change", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDocs(collection(db, "users", OWNER, "epfWageHistory")));
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "epfWageHistory"), {
        establishmentId: "est-1",
        effectiveFromMonth: "2027-01",
        wage: 30000,
        epsEligible: true,
        createdAtMs: 2,
        updatedAtMs: 2,
      })
    );
  });

  it("owner can set explicit share overrides", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "epfWageHistory"), {
        establishmentId: "est-1",
        effectiveFromMonth: "2027-02",
        wage: 30000,
        epsEligible: true,
        employeeShareOverride: 3600,
        employerShareOverride: 3600,
        epsShareOverride: 1250,
        employerEpfShareOverride: 2350,
        createdAtMs: 2,
        updatedAtMs: 2,
      })
    );
  });

  it("rejects schema pollution, a bad month, a negative wage, and mutable identity", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "epfWageHistory"), { ...valid, extra: true })
    );
    await assertFails(
      addDoc(collection(db, "users", OWNER, "epfWageHistory"), {
        ...valid,
        effectiveFromMonth: "2026-9",
      })
    );
    await assertFails(
      addDoc(collection(db, "users", OWNER, "epfWageHistory"), { ...valid, wage: -1 })
    );
    await assertFails(
      updateDoc(doc(db, "users", OWNER, "epfWageHistory", "wh-1"), {
        establishmentId: "est-2",
      })
    );
    await assertFails(
      updateDoc(doc(db, "users", OWNER, "epfWageHistory", "wh-1"), {
        effectiveFromMonth: "2026-10",
      })
    );
    await assertFails(
      updateDoc(doc(db, "users", OWNER, "epfWageHistory", "wh-1"), { createdAtMs: 2 })
    );
  });

  it("allows updating the wage and overrides without touching pinned fields", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "users", OWNER, "epfWageHistory", "wh-1"),
        { ...valid, wage: 26000, updatedAtMs: 2 },
        { merge: true }
      )
    );
  });

  it("isolates users and denies unknown personal collections", async () => {
    const owner = env.authenticatedContext(OWNER).firestore();
    const other = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(other, "users", OWNER, "epfWageHistory")));
    await assertFails(deleteDoc(doc(other, "users", OWNER, "epfWageHistory", "wh-1")));
    await assertFails(setDoc(doc(owner, "users", OWNER, "notEpfWageHistory", "x"), valid));
  });
});
