import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { DEVICE_DOC_KEYS, buildDeviceFields } from "../shared/utils/pushDevice";

/** SPENDLY-224: users/{uid}/devices/{installId}, one per signed-in install. */

const PROJECT_ID = "spendly-devices";
const OWNER = "u-owner";
const OTHER = "u-other";
const INSTALL = "a1B2c3D4e5F6g7H8i9J0k1L2";
const TOKEN = "ExponentPushToken[abcDEF123456xyz]";

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

type TestDb = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;

const db = (uid = OWNER): TestDb => env.authenticatedContext(uid).firestore();
const anon = (): TestDb => env.unauthenticatedContext().firestore();
const deviceRef = (fs: TestDb, installId = INSTALL, uid = OWNER) => doc(fs, "users", uid, "devices", installId);

/** The document lib/pushRegistration writes on create. */
const created = (over: Record<string, unknown> = {}) => ({
  ...buildDeviceFields({ token: TOKEN, platform: "android", appVersion: "5.1.0", locale: "en-IN" }),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  lastSeenAt: serverTimestamp(),
  ...over,
});

/** The fields lib/pushRegistration writes on refresh. */
const refreshed = (over: Record<string, unknown> = {}) => ({
  ...buildDeviceFields({ token: "ExponentPushToken[newNEW1234567]", platform: "android", appVersion: "5.1.1", locale: "en-IN" }),
  updatedAt: serverTimestamp(),
  lastSeenAt: serverTimestamp(),
  ...over,
});

async function seed() {
  await assertSucceeds(setDoc(deviceRef(db()), created()));
}

describe("devices rules", () => {
  it("the document the app writes covers exactly the allowed keys", async () => {
    const keys = Object.keys(created()).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...DEVICE_DOC_KEYS].sort())) {
      throw new Error(`device document keys drifted from DEVICE_DOC_KEYS: ${keys.join(", ")}`);
    }
  });

  it("the owner can register, refresh, read and remove their device", async () => {
    await seed();
    await assertSucceeds(updateDoc(deviceRef(db()), refreshed()));
    await assertSucceeds(getDoc(deviceRef(db())));
    await assertSucceeds(deleteDoc(deviceRef(db())));
  });

  it("re-registering an existing install (record lost on the device) is allowed", async () => {
    await seed();
    await assertSucceeds(setDoc(deviceRef(db()), created()));
  });

  it("another user can't read, write or delete it", async () => {
    await seed();
    await assertFails(getDoc(deviceRef(db(OTHER))));
    await assertFails(updateDoc(deviceRef(db(OTHER)), refreshed()));
    await assertFails(deleteDoc(deviceRef(db(OTHER))));
    await assertFails(setDoc(deviceRef(db(OTHER), "z9Y8x7W6v5U4t3S2r1Q0", OWNER), created()));
  });

  it("anonymous visitors can't read or write", async () => {
    await seed();
    await assertFails(getDoc(deviceRef(anon())));
    await assertFails(setDoc(deviceRef(anon(), "z9Y8x7W6v5U4t3S2r1Q0"), created()));
  });

  it("createdAt is pinned after create", async () => {
    await seed();
    await assertFails(updateDoc(deviceRef(db()), refreshed({ createdAt: Timestamp.fromMillis(0) })));
  });

  it.each([
    ["an extra field", { email: "x@y.z" }],
    ["a non-Expo token", { token: "raw-fcm-token" }],
    ["another product", { product: "ganesh" }],
    ["web platform", { platform: "web" }],
    ["a client-chosen timestamp", { updatedAt: Timestamp.fromMillis(0) }],
    ["a missing lastSeenAt", { lastSeenAt: undefined }],
  ])("rejects %s", async (_label, over) => {
    const data: Record<string, unknown> = created(over);
    for (const [k, v] of Object.entries(data)) if (v === undefined) delete data[k];
    await assertFails(setDoc(deviceRef(db()), data));
  });

  it("rejects a malformed install id", async () => {
    await assertFails(setDoc(deviceRef(db(), "short"), created()));
  });
});

/** SPENDLY-227: the push sender's own documents are server-only. */
describe("pushConfig and pushSendLogs", () => {
  it("no client can read or write them, signed in or not", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "pushConfig", "global"), { sendsDisabled: false });
      await setDoc(doc(ctx.firestore(), "pushSendLogs", "k1"), { status: "done" });
    });
    for (const fs of [db(), anon()]) {
      await assertFails(getDoc(doc(fs, "pushConfig", "global")));
      await assertFails(setDoc(doc(fs, "pushConfig", "global"), { sendsDisabled: true }));
      await assertFails(getDoc(doc(fs, "pushSendLogs", "k1")));
      await assertFails(setDoc(doc(fs, "pushSendLogs", "k2"), { status: "sending" }));
    }
  });
});
