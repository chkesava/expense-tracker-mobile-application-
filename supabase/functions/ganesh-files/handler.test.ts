import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_BATCH_PATHS,
  handleGaneshFiles,
  type Deps,
  type SignedUrlResult,
  type StoragePort,
} from "./handler";

/**
 * These exercise the Edge Function's authorization rules directly (GS-096).
 *
 * The batch action hands out one signed URL per requested object, so the thing
 * worth testing is not that batching works — it is that batching cannot be used
 * to get a URL for something the caller could not have asked for one at a time.
 * Every case below is about that: a foreign pandal, a malformed path, a rejected
 * token, a batch too large to be a list view.
 */

const PANDAL_A = "pandalA";
const PANDAL_B = "pandalB";

const A_ASSET = `pandals/${PANDAL_A}/assets/asset1/photo.jpg`;
const A_RECEIPT = `pandals/${PANDAL_A}/festivals/fest2026/expenses/exp1/receipt.jpg`;
const A_SPONSOR = `pandals/${PANDAL_A}/sponsors/sponsor1/logo.png`;
const B_ASSET = `pandals/${PANDAL_B}/assets/asset9/photo.jpg`;

/** A Firebase-shaped token: only the middle segment is ever read. */
function tokenFor(uid: string): string {
  const payload = Buffer.from(JSON.stringify({ user_id: uid })).toString("base64url");
  return `header.${payload}.signature`;
}

const MEMBER_TOKEN = tokenFor("uid-member");

type Firestore = {
  /** uid -> pandals the uid is an active member of. */
  activeIn: Record<string, string[]>;
  /** When true, Firestore rejects the token outright, as it does when expired. */
  rejectToken?: boolean;
};

function makeDeps(firestore: Firestore, storage?: Partial<StoragePort>) {
  const signedUrls = vi.fn(
    async (paths: string[]): Promise<SignedUrlResult[]> =>
      paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null }))
  );

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (firestore.rejectToken) {
      return new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED" } }), { status: 401 });
    }
    const match = /documents\/pandals\/([^/]+)\/members\/([^/?]+)/.exec(url);
    if (!match) return new Response("{}", { status: 404 });
    const [, pandalId, uid] = match;
    // The real Firestore is reached with the caller's own token; a request
    // without it must never look like a member read that succeeded.
    const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (!authorization) return new Response("{}", { status: 401 });
    if (!(firestore.activeIn[uid] ?? []).includes(pandalId)) {
      return new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 });
    }
    return new Response(JSON.stringify({ fields: { status: { stringValue: "active" } } }), {
      status: 200,
    });
  });

  const deps: Deps = {
    firebaseProjectId: "test-project",
    fetch: fetchMock as unknown as typeof fetch,
    storage: {
      createSignedUploadUrl: vi.fn(async (path: string) => ({
        path,
        token: "upload-token",
        signedUrl: `https://upload.example/${path}`,
      })),
      createSignedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
      createSignedUrls: signedUrls,
      remove: vi.fn(async () => undefined),
      ...storage,
    },
  };
  return { deps, signedUrls, fetchMock };
}

function batchRequest(paths: unknown, token: string | null = MEMBER_TOKEN): Request {
  return new Request("https://functions.example/ganesh-files", {
    method: "POST",
    headers: token
      ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body: JSON.stringify({ operation: "downloadBatch", paths }),
  });
}

type BatchBody = { expiresIn: number; results: SignedUrlResult[] };

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The function logs storage failures on purpose; keep the suite output clean.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("downloadBatch — authorized files", () => {
  it("signs every path in one storage call and keeps request order", async () => {
    const { deps, signedUrls } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });
    const paths = [A_ASSET, A_RECEIPT, A_SPONSOR];

    const response = await handleGaneshFiles(batchRequest(paths), deps);
    const body = (await response.json()) as BatchBody;

    expect(response.status).toBe(200);
    expect(body.results.map((entry) => entry.path)).toEqual(paths);
    expect(body.results.every((entry) => entry.signedUrl && !entry.error)).toBe(true);
    expect(signedUrls).toHaveBeenCalledTimes(1);
    expect(signedUrls.mock.calls[0][1]).toBe(DOWNLOAD_URL_TTL_SECONDS);
  });

  it("preserves the single-path expiry policy", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const batch = (await (
      await handleGaneshFiles(batchRequest([A_ASSET]), deps)
    ).json()) as BatchBody;
    const single = (await (
      await handleGaneshFiles(
        new Request("https://functions.example/ganesh-files", {
          method: "POST",
          headers: { authorization: `Bearer ${MEMBER_TOKEN}` },
          body: JSON.stringify({ operation: "download", path: A_ASSET }),
        }),
        deps
      )
    ).json()) as { expiresIn: number };

    expect(batch.expiresIn).toBe(single.expiresIn);
    expect(batch.expiresIn).toBe(DOWNLOAD_URL_TTL_SECONDS);
  });

  it("checks membership once per pandal, not once per file", async () => {
    const { deps, fetchMock } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    await handleGaneshFiles(batchRequest([A_ASSET, A_RECEIPT, A_SPONSOR]), deps);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signs a repeated path once but answers both positions", async () => {
    const { deps, signedUrls } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(batchRequest([A_ASSET, A_ASSET]), deps);
    const body = (await response.json()) as BatchBody;

    expect(signedUrls.mock.calls[0][0]).toEqual([A_ASSET]);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].signedUrl).toBe(body.results[1].signedUrl);
  });
});

describe("downloadBatch — unauthorized files", () => {
  it("refuses a pandal the caller is not a member of", async () => {
    const { deps, signedUrls } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(batchRequest([B_ASSET]), deps);
    const body = (await response.json()) as BatchBody;

    expect(response.status).toBe(200);
    expect(body.results[0].signedUrl).toBeNull();
    expect(body.results[0].error).toMatch(/permission/i);
    // Nothing was signed at all — an unauthorized path must not reach Storage.
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it("refuses a member whose status is not active", async () => {
    const { deps } = makeDeps({ activeIn: {} });

    const body = (await (
      await handleGaneshFiles(batchRequest([A_ASSET]), deps)
    ).json()) as BatchBody;

    expect(body.results[0].signedUrl).toBeNull();
    expect(body.results[0].error).toMatch(/permission/i);
  });
});

describe("downloadBatch — mixed authorized and unauthorized", () => {
  it("signs what the caller may have and refuses the rest, in place", async () => {
    const { deps, signedUrls } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });
    const paths = [A_ASSET, B_ASSET, "pandals/../../etc/passwd", A_RECEIPT];

    const response = await handleGaneshFiles(batchRequest(paths), deps);
    const body = (await response.json()) as BatchBody;

    expect(response.status).toBe(200);
    expect(body.results.map((entry) => entry.path)).toEqual(paths);
    expect(body.results[0].signedUrl).toBeTruthy();
    expect(body.results[1].signedUrl).toBeNull();
    expect(body.results[1].error).toMatch(/permission/i);
    expect(body.results[2].signedUrl).toBeNull();
    expect(body.results[2].error).toMatch(/Invalid storage path/);
    expect(body.results[3].signedUrl).toBeTruthy();
    // Only the two authorized paths were ever signed.
    expect(signedUrls.mock.calls[0][0]).toEqual([A_ASSET, A_RECEIPT]);
  });

  it("keeps the other URLs when one object fails to sign", async () => {
    const { deps } = makeDeps(
      { activeIn: { "uid-member": [PANDAL_A] } },
      {
        createSignedUrls: async (paths) =>
          paths.map((path) =>
            path === A_RECEIPT
              ? { path, signedUrl: null, error: "Object not found" }
              : { path, signedUrl: `https://signed.example/${path}`, error: null }
          ),
      }
    );

    const body = (await (
      await handleGaneshFiles(batchRequest([A_ASSET, A_RECEIPT]), deps)
    ).json()) as BatchBody;

    expect(body.results[0].signedUrl).toBeTruthy();
    expect(body.results[1].signedUrl).toBeNull();
    // The storage error is logged, never echoed — it can leak bucket internals.
    expect(body.results[1].error).not.toMatch(/Object not found/);
    expect(consoleError).toHaveBeenCalled();
  });

  it("fails the whole batch, without leaking details, if signing throws", async () => {
    const { deps } = makeDeps(
      { activeIn: { "uid-member": [PANDAL_A] } },
      {
        createSignedUrls: async () => {
          throw new Error("bucket ganesh-files: internal detail");
        },
      }
    );

    const response = await handleGaneshFiles(batchRequest([A_ASSET]), deps);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).not.toMatch(/internal detail/);
  });
});

describe("downloadBatch — batch size", () => {
  it("accepts a batch at the cap", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });
    const paths = Array.from(
      { length: MAX_BATCH_PATHS },
      (_, index) => `pandals/${PANDAL_A}/assets/asset${index}/photo.jpg`
    );

    const response = await handleGaneshFiles(batchRequest(paths), deps);

    expect(response.status).toBe(200);
    expect(((await response.json()) as BatchBody).results).toHaveLength(MAX_BATCH_PATHS);
  });

  it("rejects an oversized batch before doing any work", async () => {
    const { deps, signedUrls, fetchMock } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });
    const paths = Array.from(
      { length: MAX_BATCH_PATHS + 1 },
      (_, index) => `pandals/${PANDAL_A}/assets/asset${index}/photo.jpg`
    );

    const response = await handleGaneshFiles(batchRequest(paths), deps);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it("rejects a batch spread across more pandals than a session can have", async () => {
    const { deps, fetchMock } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });
    const paths = ["p1", "p2", "p3", "p4", "p5"].map(
      (pandalId) => `pandals/${pandalId}/assets/asset1/photo.jpg`
    );

    const response = await handleGaneshFiles(batchRequest(paths), deps);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty batch", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    expect((await handleGaneshFiles(batchRequest([]), deps)).status).toBe(400);
  });
});

describe("downloadBatch — invalid paths", () => {
  const invalid = [
    "pandals/pandalA/../pandalB/assets/asset1/photo.jpg",
    "/pandals/pandalA/assets/asset1/photo.jpg",
    "pandals/pandalA/assets/asset1/sub/photo.jpg",
    "pandals/pandalA/festivals/fest1/payroll/rec1/file.jpg",
    "other/pandalA/assets/asset1/photo.jpg",
    "pandals//assets/asset1/photo.jpg",
    "pandals/pandalA/assets/asset1/photo .jpg",
    "",
  ];

  it.each(invalid)("refuses %j without touching Firestore or Storage", async (path) => {
    const { deps, signedUrls, fetchMock } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const body = (await (
      await handleGaneshFiles(batchRequest([path]), deps)
    ).json()) as BatchBody;

    expect(body.results[0].error).toMatch(/Invalid storage path/);
    expect(body.results[0].signedUrl).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it("rejects a non-array or non-string payload", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    expect((await handleGaneshFiles(batchRequest("not-an-array"), deps)).status).toBe(400);
    expect((await handleGaneshFiles(batchRequest([A_ASSET, 42]), deps)).status).toBe(400);
    expect((await handleGaneshFiles(batchRequest([{ path: A_ASSET }]), deps)).status).toBe(400);
  });
});

describe("downloadBatch — authentication", () => {
  it("rejects a request with no token", async () => {
    const { deps, fetchMock } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(batchRequest([A_ASSET], null), deps);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an expired token — Firestore refuses it, so nothing is signed", async () => {
    const { deps, signedUrls } = makeDeps({
      activeIn: { "uid-member": [PANDAL_A] },
      rejectToken: true,
    });

    const response = await handleGaneshFiles(batchRequest([A_ASSET]), deps);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/Sign in again/);
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it("rejects a token that is not a JWT at all", async () => {
    const { deps, signedUrls, fetchMock } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(batchRequest([A_ASSET], "garbage"), deps);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signedUrls).not.toHaveBeenCalled();
  });

  it("does not let one caller's token mint another uid's files", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A], "uid-other": [PANDAL_B] } });

    const body = (await (
      await handleGaneshFiles(batchRequest([B_ASSET], MEMBER_TOKEN), deps)
    ).json()) as BatchBody;

    expect(body.results[0].signedUrl).toBeNull();
  });
});

describe("existing single-path operations", () => {
  it("still mints one download URL", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(
      new Request("https://functions.example/ganesh-files", {
        method: "POST",
        headers: { authorization: `Bearer ${MEMBER_TOKEN}` },
        body: JSON.stringify({ operation: "download", path: A_ASSET }),
      }),
      deps
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as { signedUrl: string }).signedUrl).toContain(A_ASSET);
  });

  it("still refuses another pandal's path with 403", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(
      new Request("https://functions.example/ganesh-files", {
        method: "POST",
        headers: { authorization: `Bearer ${MEMBER_TOKEN}` },
        body: JSON.stringify({ operation: "download", path: B_ASSET }),
      }),
      deps
    );

    expect(response.status).toBe(403);
  });

  it("rejects an unknown operation", async () => {
    const { deps } = makeDeps({ activeIn: { "uid-member": [PANDAL_A] } });

    const response = await handleGaneshFiles(
      new Request("https://functions.example/ganesh-files", {
        method: "POST",
        headers: { authorization: `Bearer ${MEMBER_TOKEN}` },
        body: JSON.stringify({ operation: "downloadEverything", paths: [A_ASSET] }),
      }),
      deps
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/Unknown operation/);
  });
});
