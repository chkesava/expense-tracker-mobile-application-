import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    platform: { OS: "android" as string },
    constants: { executionEnvironment: "standalone", expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
    permission: { status: "granted" as string },
    token: { data: "ExponentPushToken[abcDEF123456xyz]" as string },
    getExpoPushTokenAsync: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    noteDirectWrites: vi.fn(),
    logWarning: vi.fn(),
    localTest: { on: false },
  };
});

vi.mock("react-native", () => ({ Platform: m.platform }));
vi.mock("expo-constants", () => ({ default: m.constants }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "5.1.0" }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => m.permission,
  getExpoPushTokenAsync: m.getExpoPushTokenAsync,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => m.store.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.store.set(k, v),
    removeItem: async (k: string) => void m.store.delete(k),
  },
}));
vi.mock("@/lib/activeProduct", () => ({ ACTIVE_PRODUCT: "expense" }));
vi.mock("@/lib/env", () => ({ isLocalTestMode: () => m.localTest.on }));
vi.mock("@/lib/errors", () => ({ logWarning: m.logWarning }));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({}) }));
vi.mock("@/lib/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  serverTimestamp: () => "SERVER_TS",
  setDoc: m.setDoc,
  updateDoc: m.updateDoc,
  deleteDoc: m.deleteDoc,
}));
vi.mock("@/lib/firestoreWrite", () => ({ commitWrite: async (run: () => Promise<unknown>) => (await run(), "acked") }));
vi.mock("@/lib/readModelWriteHooks", () => ({ noteDirectWrites: m.noteDirectWrites }));

import { getInstallId, registerPushDevice, unregisterPushDevice } from "./pushRegistration";

beforeEach(() => {
  m.store.clear();
  m.platform.OS = "android";
  m.permission.status = "granted";
  m.localTest.on = false;
  m.constants.executionEnvironment = "standalone";
  m.getExpoPushTokenAsync.mockReset().mockImplementation(async () => m.token);
  for (const fn of [m.setDoc, m.updateDoc, m.deleteDoc]) fn.mockReset().mockResolvedValue(undefined);
  m.noteDirectWrites.mockReset();
  m.logWarning.mockReset();
});

describe("registerPushDevice", () => {
  it("creates the device document on first registration and tells the read model", async () => {
    const res = await registerPushDevice("u1", { duress: false });
    const installId = await getInstallId();

    expect(res).toEqual({ status: "created" });
    expect(m.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(m.setDoc).toHaveBeenCalledWith(
      { path: `users/u1/devices/${installId}` },
      expect.objectContaining({
        token: "ExponentPushToken[abcDEF123456xyz]",
        product: "expense",
        platform: "android",
        appVersion: "5.1.0",
        createdAt: "SERVER_TS",
        updatedAt: "SERVER_TS",
        lastSeenAt: "SERVER_TS",
      })
    );
    expect(m.noteDirectWrites).toHaveBeenCalledWith("u1", [`users/u1/devices/${installId}`]);
  });

  it("writes nothing again the same day when nothing changed", async () => {
    await registerPushDevice("u1", { duress: false });
    m.setDoc.mockClear();

    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "unchanged" });
    expect(m.setDoc).not.toHaveBeenCalled();
    expect(m.updateDoc).not.toHaveBeenCalled();
  });

  it("refreshes (without touching createdAt) when the token changes", async () => {
    await registerPushDevice("u1", { duress: false });
    m.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[newNEW1234567]" });

    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "refreshed" });
    const fields = m.updateDoc.mock.calls[0][1];
    expect(fields.token).toBe("ExponentPushToken[newNEW1234567]");
    expect(fields).not.toHaveProperty("createdAt");
  });

  it("writes a new document when another user signs in on the same install", async () => {
    await registerPushDevice("u1", { duress: false });
    m.setDoc.mockClear();

    expect(await registerPushDevice("u2", { duress: false })).toEqual({ status: "created" });
    expect(m.setDoc.mock.calls[0][0].path).toMatch(/^users\/u2\/devices\//);
  });

  it("forgets the record when a refresh fails, so the next run writes the full document", async () => {
    await registerPushDevice("u1", { duress: false });
    m.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[newNEW1234567]" });
    m.updateDoc.mockRejectedValue(new Error("not-found"));

    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "failed" });
    expect(m.logWarning).toHaveBeenCalled();
    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "created" });
  });

  it.each([
    ["no permission (never prompts)", () => void (m.permission.status = "denied"), "no-permission"],
    ["web", () => void (m.platform.OS = "web"), "web"],
    ["the local test build", () => void (m.localTest.on = true), "local-test-build"],
    ["Expo Go", () => void (m.constants.executionEnvironment = "storeClient"), "expo-go"],
  ])("skips %s", async (_label, arrange, reason) => {
    arrange();
    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "skipped", reason });
    expect(m.setDoc).not.toHaveBeenCalled();
  });

  it("skips the duress session and signed-out state", async () => {
    expect(await registerPushDevice("u1", { duress: true })).toEqual({ status: "skipped", reason: "duress" });
    expect(await registerPushDevice(null, { duress: false })).toEqual({ status: "skipped", reason: "signed-out" });
  });

  it("never throws when the token can't be fetched", async () => {
    m.getExpoPushTokenAsync.mockRejectedValue(new Error("no FCM"));
    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "failed" });
  });
});

describe("unregisterPushDevice", () => {
  it("deletes this install's document for the signed-out user and tells the read model", async () => {
    await registerPushDevice("u1", { duress: false });
    const installId = await getInstallId();

    await unregisterPushDevice("u1");

    expect(m.deleteDoc).toHaveBeenCalledWith({ path: `users/u1/devices/${installId}` });
    expect(m.noteDirectWrites).toHaveBeenLastCalledWith("u1", [`users/u1/devices/${installId}`]);
    // The next sign-in registers from scratch.
    m.setDoc.mockClear();
    expect(await registerPushDevice("u1", { duress: false })).toEqual({ status: "created" });
  });

  it("does nothing when this install never registered for that user", async () => {
    await unregisterPushDevice("u1");
    await registerPushDevice("u1", { duress: false });
    await unregisterPushDevice("u2");
    expect(m.deleteDoc).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    await registerPushDevice("u1", { duress: false });
    m.deleteDoc.mockRejectedValue(new Error("offline"));
    await expect(unregisterPushDevice("u1")).resolves.toBeUndefined();
  });
});
