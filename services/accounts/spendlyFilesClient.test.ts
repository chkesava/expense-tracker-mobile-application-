import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-616: spendly-files lives in Spendly's own Supabase project (the read
 * model), never in the Ganesh Seva project behind `env.supabase`.
 */
const mocks = vi.hoisted(() => ({
  env: {
    supabase: { url: "https://ganesh.supabase.co", publishableKey: "ganesh-key" },
    readModel: { url: "https://spendly.supabase.co", publishableKey: "spendly-key" },
  },
  testMode: false,
  createClient: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env, isLocalTestMode: () => mocks.testMode }));
vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => "firebase-token" } }),
}));
vi.mock("@/lib/networkGuard", () => ({ assertNetworkAllowed: () => undefined }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { createDocumentSignedUrl, spendlyFilesProject, uploadDocumentObject } from "./spendlyFilesClient";

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.testMode = false;
  mocks.env.readModel.url = "https://spendly.supabase.co";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mocks.createClient.mockReturnValue({
    storage: { from: () => ({ uploadToSignedUrl: mocks.uploadToSignedUrl }) },
  });
  mocks.uploadToSignedUrl.mockResolvedValue({ error: null });
});

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) };
}

describe("spendly-files project (SPENDLY-616)", () => {
  it("uses the read-model project, not the Ganesh Seva one", () => {
    expect(spendlyFilesProject()).toEqual({ url: "https://spendly.supabase.co", publishableKey: "spendly-key" });
  });

  it("is unconfigured in a local test build", () => {
    mocks.testMode = true;
    expect(spendlyFilesProject()).toBeNull();
  });

  it("calls the Edge Function on the read-model project", async () => {
    fetchMock.mockResolvedValue(json({ signedUrl: "https://signed" }));
    await expect(createDocumentSignedUrl("users/u1/goals/g1/i1/image.jpg")).resolves.toBe("https://signed");
    expect(fetchMock).toHaveBeenCalledWith("https://spendly.supabase.co/functions/v1/spendly-files", expect.anything());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer firebase-token");
  });

  it("uploads bytes through a client on the read-model project", async () => {
    fetchMock
      .mockResolvedValueOnce(json({})) // bytesFromUri
      .mockResolvedValueOnce(json({ path: "p", token: "t" }));
    await uploadDocumentObject("users/u1/goals/g1/i1/image.jpg", "file:///x.jpg", "image/jpeg", 4);
    expect(mocks.createClient).toHaveBeenCalledWith("https://spendly.supabase.co", "spendly-key", expect.anything());
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledWith("p", "t", expect.any(ArrayBuffer), { contentType: "image/jpeg" });
  });

  it("refuses with a clear error when the read model is not configured", async () => {
    mocks.env.readModel.url = "";
    await expect(createDocumentSignedUrl("users/u1/goals/g1/i1/image.jpg")).rejects.toThrow("Storage is unavailable right now.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never holds a service-role key or asks for a public URL", () => {
    const source = readFileSync(path.join(__dirname, "spendlyFilesClient.ts"), "utf8");
    expect(source).not.toMatch(/SERVICE_ROLE|serviceRole/);
    expect(source).not.toContain("getPublicUrl");
  });
});
