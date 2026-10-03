import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-183 — users/{uid}/calendarReminders. */

const PROJECT_ID = "spendly-calendar-reminders";
const OWNER = "u-owner";
const OTHER = "u-other";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const valid = (over: Record<string, unknown> = {}) => ({
  title: "Renew insurance",
  startDate: "2026-10-20",
  category: "insurance",
  recurrence: "none",
  remindDaysBefore: 1,
  completedDates: [],
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});
const ref = (uid: string, id = "r1") =>
  doc(env.authenticatedContext(uid.endsWith("_duress") ? OWNER : uid).firestore(), "users", uid, "calendarReminders", id);

describe("calendar reminders", () => {
  it("lets the owner and duress twin create, read, update and delete", async () => {
    await assertSucceeds(
      setDoc(ref(OWNER), valid({ time: "09:30", estimatedAmount: 12000, note: "policy", recurrence: "every_n_days", intervalDays: 30, untilDate: "2027-10-20" }))
    );
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(updateDoc(ref(OWNER), { completedDates: ["2026-10-20"], updatedAtMs: 2 }));
    await assertSucceeds(deleteDoc(ref(OWNER)));
    await assertSucceeds(setDoc(ref(`${OWNER}_duress`), valid()));
  });

  it("denies other users", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "users", OWNER, "calendarReminders", "r1"), valid());
    });
    const other = doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "calendarReminders", "r1");
    await assertFails(getDoc(other));
    await assertFails(setDoc(other, valid()));
    await assertFails(deleteDoc(other));
  });

  it("rejects ledger-shaped and unknown fields", async () => {
    await assertFails(setDoc(ref(OWNER), valid({ amount: 100 })));
    await assertFails(setDoc(ref(OWNER), valid({ date: "2026-10-20" })));
    await assertFails(setDoc(ref(OWNER), valid({ accountId: "a1" })));
  });

  it("rejects bad values", async () => {
    for (const bad of [
      { title: "" },
      { title: "x".repeat(121) },
      { startDate: "20-10-2026" },
      { time: "9:30" },
      { estimatedAmount: -1 },
      { category: "food" },
      { recurrence: "weekly" },
      { recurrence: "every_n_days" },
      { recurrence: "every_n_days", intervalDays: 0 },
      { recurrence: "every_n_days", intervalDays: 1.5 },
      { untilDate: "soon" },
      { note: "x".repeat(501) },
      { remindDaysBefore: 2 },
      { completedDates: "2026-10-20" },
    ]) {
      await assertFails(setDoc(ref(OWNER), valid(bad)));
    }
    const { updatedAtMs: _u, ...missing } = valid();
    void _u;
    await assertFails(setDoc(ref(OWNER), missing));
  });

  it("pins createdAtMs on update", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertFails(updateDoc(ref(OWNER), { createdAtMs: 99 }));
  });
});
