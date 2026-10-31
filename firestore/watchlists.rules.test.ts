import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-654 — users/{uid}/watchlists/{listId} and its items/{yahooSymbol}. */

const PROJECT_ID = "spendly-watchlists";
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

/** The handle @firebase/rules-unit-testing returns (other rules tests pass it straight to `doc`). */
type TestDb = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;

const db = (uid = OWNER): TestDb => env.authenticatedContext(uid).firestore();
const listRef = (fs: TestDb, listId = "default", uid = OWNER) => doc(fs, "users", uid, "watchlists", listId);
const itemRef = (fs: TestDb, itemId = "TCS.NS", listId = "default", uid = OWNER) => doc(fs, "users", uid, "watchlists", listId, "items", itemId);

const list = (listId = "default", over: Record<string, unknown> = {}) => ({
  name: "My watchlist",
  isDefault: listId === "default",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

const item = (yahooSymbol = "TCS.NS", over: Record<string, unknown> = {}) => ({
  symbol: yahooSymbol.replace(/\.(NS|BO)$/, ""),
  yahooSymbol,
  name: "Tata Consultancy Services",
  exchange: "NSE",
  instrumentType: "stock",
  order: 1024,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

/** Seed a list (and optionally items) with rules off. */
async function seed(listId = "default", items: string[] = []) {
  await env.withSecurityRulesDisabled(async (c) => {
    const fs = c.firestore();
    await setDoc(listRef(fs, listId), { ...list(listId), createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) });
    for (const sym of items) await setDoc(itemRef(fs, sym, listId), { ...item(sym), createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) });
  });
}

describe("watchlists: lists", () => {
  it("lets the owner (and duress twin) create, read, rename and delete a list", async () => {
    await assertSucceeds(setDoc(listRef(db(), "wl_abc"), list("wl_abc", { name: "IT picks" })));
    await assertSucceeds(getDoc(listRef(db(), "wl_abc")));
    await assertSucceeds(updateDoc(listRef(db(), "wl_abc"), { name: "Banks", updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(listRef(db(), "wl_abc")));
    await assertSucceeds(setDoc(doc(env.authenticatedContext(OWNER).firestore(), "users", `${OWNER}_duress`, "watchlists", "default"), list()));
  });

  it("denies other users", async () => {
    await seed();
    await assertFails(getDoc(listRef(db(OTHER))));
    await assertFails(setDoc(listRef(db(OTHER), "wl_x"), list("wl_x")));
    await assertFails(deleteDoc(listRef(db(OTHER), "default")));
    await assertFails(getDoc(listRef(env.unauthenticatedContext().firestore())));
  });

  it("rejects bad shapes", async () => {
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { extra: 1 })));
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { name: "" })));
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { name: "x".repeat(41) })));
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { isDefault: true })));
    await assertFails(setDoc(listRef(db(), "default"), list("default", { isDefault: false })));
    await assertFails(setDoc(listRef(db(), "bad id!"), list("bad id!")));
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { amount: 100 })));
  });

  it("stamps times on the server: no client createdAt, no stale updatedAt", async () => {
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { createdAt: Timestamp.fromMillis(5) })));
    await assertFails(setDoc(listRef(db(), "wl_a"), list("wl_a", { updatedAt: Timestamp.fromMillis(5) })));
    await seed("wl_b");
    await assertFails(updateDoc(listRef(db(), "wl_b"), { name: "x" }));
    await assertFails(updateDoc(listRef(db(), "wl_b"), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it("records the legacy import once and never changes it", async () => {
    await seed();
    await assertSucceeds(updateDoc(listRef(db()), { importedLegacyAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(listRef(db()), { importedLegacyAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(listRef(db()), { name: "Renamed", updatedAt: serverTimestamp() }));
  });

  it("never deletes the default list", async () => {
    await seed();
    await assertFails(deleteDoc(listRef(db())));
  });
});

describe("watchlists: items", () => {
  it("lets the owner add, read, reorder and remove an item in an existing list", async () => {
    await seed();
    await assertSucceeds(setDoc(itemRef(db()), item()));
    await assertSucceeds(getDoc(itemRef(db())));
    await assertSucceeds(updateDoc(itemRef(db()), { order: 512, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(itemRef(db())));
  });

  it("allows creating a list and its items in one batch", async () => {
    const fs = db();
    const batch = writeBatch(fs);
    batch.set(listRef(fs, "wl_new"), list("wl_new", { name: "New" }));
    batch.set(itemRef(fs, "INFY.NS", "wl_new"), item("INFY.NS"));
    batch.set(itemRef(fs, "^NSEI", "wl_new"), item("^NSEI", { symbol: "^NSEI", name: "NIFTY 50" }));
    await assertSucceeds(batch.commit());
  });

  it("refuses an item in a list that doesn't exist", async () => {
    await assertFails(setDoc(itemRef(db(), "TCS.NS", "missing"), item()));
  });

  it("keys items by symbol: the id must equal yahooSymbol and look like one", async () => {
    await seed();
    await assertFails(setDoc(itemRef(db(), "TCS.NS"), item("INFY.NS")));
    await assertFails(setDoc(itemRef(db(), "tcs.ns"), item("tcs.ns")));
    await assertFails(setDoc(itemRef(db(), "MF:120503"), item("MF:120503")));
    await assertSucceeds(setDoc(itemRef(db(), "M&M.NS"), item("M&M.NS")));
  });

  it("rejects bad shapes, money fields and out-of-range ranks", async () => {
    await seed();
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { quantity: 10 })));
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { averagePrice: 3000 })));
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { exchange: "LSE" })));
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { instrumentType: "bond" })));
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { order: 1e13 })));
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { order: "1" })));
    await assertFails(setDoc(itemRef(db()), item("TCS.NS", { name: "" })));
    const { order: _omit, ...missingOrder } = item();
    await assertFails(setDoc(itemRef(db()), missingOrder));
  });

  it("stamps times on the server and pins createdAt", async () => {
    await seed("default", ["TCS.NS"]);
    await assertFails(setDoc(itemRef(db(), "INFY.NS"), item("INFY.NS", { createdAt: Timestamp.fromMillis(5) })));
    await assertFails(updateDoc(itemRef(db()), { order: 1, updatedAt: Timestamp.fromMillis(5) }));
    await assertFails(updateDoc(itemRef(db()), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it("denies other users", async () => {
    await seed("default", ["TCS.NS"]);
    await assertFails(getDoc(itemRef(db(OTHER))));
    await assertFails(setDoc(itemRef(db(OTHER), "INFY.NS"), item("INFY.NS")));
    await assertFails(deleteDoc(itemRef(db(OTHER))));
  });

  it("lets a list and its items be deleted together", async () => {
    await seed("wl_x", ["TCS.NS", "INFY.NS"]);
    const fs = db();
    const batch = writeBatch(fs);
    batch.delete(itemRef(fs, "TCS.NS", "wl_x"));
    batch.delete(itemRef(fs, "INFY.NS", "wl_x"));
    batch.delete(listRef(fs, "wl_x"));
    await assertSucceeds(batch.commit());
  });
});

describe("legacy watchlist (old APKs)", () => {
  it("still lets the owner read and write the old flat collection as before", async () => {
    const ref = doc(db(), "users", OWNER, "watchlist", "abc");
    await assertSucceeds(setDoc(ref, { symbol: "TCS", yahooSymbol: "TCS.NS", name: "TCS", exchange: "NSE", instrumentType: "stock", createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
    await assertFails(getDoc(doc(db(OTHER), "users", OWNER, "watchlist", "abc")));
  });
});
