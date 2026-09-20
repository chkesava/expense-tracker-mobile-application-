import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

// Only `getRandomBytesAsync` is still used, for the salt. expo-crypto pulls in
// react-native, which vitest's node environment cannot resolve.
vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (n: number) => new Uint8Array(randomBytes(n)),
}));

import {
  clearAllPins,
  clearDuressPin,
  deriveHash,
  getPinStatus,
  importLegacyPins,
  legacyHash,
  PBKDF2_ITERATIONS,
  pinVaultKey,
  readPinVault,
  setDuressPin,
  setPinVaultIterationsForTests,
  setPinVaultStorageForTests,
  setRealPin,
  timingSafeEqualHex,
  verifyPin,
} from "@/lib/pinVault";

const UID = "user-1";

/** SecureStore stand-in. Survives across calls like the real one does. */
function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

let store: ReturnType<typeof memoryStore>;

/** Enough rounds to be the real algorithm, few enough to stay a unit test. */
const TEST_ITERATIONS = 100;

beforeEach(() => {
  store = memoryStore();
  setPinVaultStorageForTests(store);
  setPinVaultIterationsForTests(TEST_ITERATIONS);
});

describe("deriveHash", () => {
  it("is deterministic for the same pin, salt and count", () => {
    expect(deriveHash("1234", "00ff", 1000)).toBe(deriveHash("1234", "00ff", 1000));
  });

  it("gives a different hash for the same pin under a different salt", () => {
    // The whole point of salting: two users with PIN 1234 do not collide, and
    // one rainbow table does not cover everybody.
    expect(deriveHash("1234", "00ff", 1000)).not.toBe(
      deriveHash("1234", "ff00", 1000),
    );
  });

  it("gives a different hash for a different pin", () => {
    expect(deriveHash("1234", "00ff", 1000)).not.toBe(
      deriveHash("4321", "00ff", 1000),
    );
  });
});

describe("timingSafeEqualHex", () => {
  it("accepts equal strings", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
  });

  it("rejects a difference in the last position", () => {
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
  });

  it("rejects a difference in the first position", () => {
    expect(timingSafeEqualHex("abcd", "zbcd")).toBe(false);
  });

  it("rejects a length mismatch", () => {
    expect(timingSafeEqualHex("abcd", "abcde")).toBe(false);
  });
});

describe("storing and verifying", () => {
  it("verifies the real pin", async () => {
    await setRealPin(UID, "1234");
    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
  });

  it("rejects a wrong pin", async () => {
    await setRealPin(UID, "1234");
    await expect(verifyPin(UID, "9999")).resolves.toBe("none");
  });

  it("reports no pin when nothing is stored", async () => {
    await expect(verifyPin(UID, "1234")).resolves.toBe("none");
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });

  it("distinguishes the duress pin from the real one", async () => {
    await setRealPin(UID, "1234");
    await setDuressPin(UID, "5678");
    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
    await expect(verifyPin(UID, "5678")).resolves.toBe("duress");
  });

  it("refuses a duress pin when no real pin exists", async () => {
    // A lone duress PIN unlocks nothing and advertises itself by existing.
    await expect(setDuressPin(UID, "5678")).resolves.toBe(false);
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });

  it("never writes the pin itself", async () => {
    await setRealPin(UID, "1234");
    expect(store.map.get(pinVaultKey(UID))).not.toContain("1234");
  });

  it("keeps the real pin when the duress pin is cleared", async () => {
    await setRealPin(UID, "1234");
    await setDuressPin(UID, "5678");
    await clearDuressPin(UID);
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: true,
      hasDuress: false,
    });
    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
    await expect(verifyPin(UID, "5678")).resolves.toBe("none");
  });

  it("clears everything", async () => {
    await setRealPin(UID, "1234");
    await setDuressPin(UID, "5678");
    await clearAllPins(UID);
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });

  it("keeps separate vaults per uid", async () => {
    await setRealPin("user-a", "1234");
    await setRealPin("user-b", "9999");
    await expect(verifyPin("user-a", "1234")).resolves.toBe("real");
    await expect(verifyPin("user-a", "9999")).resolves.toBe("none");
    await expect(verifyPin("user-b", "9999")).resolves.toBe("real");
  });

  it("sanitises a uid into a usable key", async () => {
    // SecureStore keys must match [A-Za-z0-9._-].
    expect(pinVaultKey("abc/def")).not.toContain("/");
  });
});

describe("legacy import", () => {
  it("adopts a plaintext pin as a full pbkdf2 entry", async () => {
    // We know the plaintext, so the weak form dies at migration.
    await importLegacyPins(UID, { real: "1234" });
    const vault = await readPinVault(UID);
    expect(vault.real?.algo).toBe("pbkdf2-sha256");
    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
  });

  it("adopts an unsalted sha-256 hash and keeps it working", async () => {
    // We do not know the plaintext, so the entry is carried over as-is.
    await importLegacyPins(UID, { real: legacyHash("1234") });
    const vault = await readPinVault(UID);
    expect(vault.real?.algo).toBe("legacy-sha256-unsalted");
    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
  });

  it("upgrades a legacy entry on the first successful unlock", async () => {
    await importLegacyPins(UID, { real: legacyHash("1234") });
    await verifyPin(UID, "1234");
    const vault = await readPinVault(UID);
    expect(vault.real?.algo).toBe("pbkdf2-sha256");
    // Still the same PIN afterwards.
    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
  });

  it("does not upgrade on a failed attempt", async () => {
    await importLegacyPins(UID, { real: legacyHash("1234") });
    await verifyPin(UID, "0000");
    expect((await readPinVault(UID)).real?.algo).toBe("legacy-sha256-unsalted");
  });

  it("re-derives an entry stored below the current iteration count", async () => {
    await setRealPin(UID, "1234");
    const vault = await readPinVault(UID);
    const stale = { ...vault.real, iterations: 1 } as typeof vault.real;
    if (!stale || stale.algo !== "pbkdf2-sha256") throw new Error("bad fixture");
    stale.hash = deriveHash("1234", stale.salt, 1);
    store.map.set(pinVaultKey(UID), JSON.stringify({ ...vault, real: stale }));

    await expect(verifyPin(UID, "1234")).resolves.toBe("real");
    const after = await readPinVault(UID);
    expect(
      after.real?.algo === "pbkdf2-sha256" ? after.real.iterations : 0,
    ).toBe(TEST_ITERATIONS);
  });

  it("imports a duress pin only alongside a real one", async () => {
    await importLegacyPins(UID, { duress: "5678" });
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });

  it("never overwrites a pin already set on this device", async () => {
    // A re-run after a crashed migration must not clobber the current PIN.
    await setRealPin(UID, "1111");
    await importLegacyPins(UID, { real: "2222" });
    await expect(verifyPin(UID, "1111")).resolves.toBe("real");
    await expect(verifyPin(UID, "2222")).resolves.toBe("none");
  });

  it("ignores an empty legacy value", async () => {
    await importLegacyPins(UID, { real: "", duress: "" });
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });
});

describe("failing closed", () => {
  it("reads a corrupt blob as no pin rather than throwing", async () => {
    store.map.set(pinVaultKey(UID), "{not json");
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
    await expect(verifyPin(UID, "1234")).resolves.toBe("none");
  });

  it("drops an entry with a missing salt", async () => {
    store.map.set(
      pinVaultKey(UID),
      JSON.stringify({ v: 1, real: { algo: "pbkdf2-sha256", hash: "ab" }, duress: null }),
    );
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });

  it("survives a storage read that rejects", async () => {
    setPinVaultStorageForTests({
      getItem: async () => {
        throw new Error("keystore unavailable");
      },
      setItem: async () => {},
      removeItem: async () => {},
    });
    await expect(getPinStatus(UID)).resolves.toEqual({
      hasReal: false,
      hasDuress: false,
    });
  });
});

describe("iteration count", () => {
  it("stays at or above the floor this ticket set", () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(50_000);
  });
});
