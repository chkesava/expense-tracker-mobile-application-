import { describe, expect, it, vi } from "vitest";

import {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_UPLOAD_BYTES,
  handleSpendlyFiles,
  ownerForPath,
  uidFromToken,
  type Deps,
  type StoragePort,
} from "./handler";

/**
 * These exercise the Edge Function's authorization rules directly (SPENDLY-88).
 *
 * The function is the only writer to a bucket that grants nobody anything, so
 * what matters is not that it can mint a URL — it is that it cannot be talked
 * into minting one for somebody else's bank statement. Nearly every case below
 * is a rejection: a foreign uid, a malformed path, a path that walks upwards, a
 * token Firestore will not authenticate, an account that is not the caller's.
 */

const OWNER = "uid-owner";
const OTHER = "uid-other";

const OWNER_DOC = `users/${OWNER}/accounts/acc1/doc1/statement.pdf`;
const OTHER_DOC = `users/${OTHER}/accounts/acc9/doc9/statement.pdf`;

/** A Firebase-shaped token: only the middle segment is ever read. */
function tokenFor(uid: string): string {
  const payload = Buffer.from(JSON.stringify({ user_id: uid })).toString("base64url");
  return `header.${payload}.signature`;
}

type FirestoreState = {
  /** uid -> account ids that exist under that uid. */
  accounts: Record<string, string[]>;
  /** When true, Firestore rejects the token outright, as it does when expired. */
  rejectToken?: boolean;
};

function makeDeps(firestore: FirestoreState, storage?: Partial<StoragePort>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (firestore.rejectToken) {
      return new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED" } }), {
        status: 401,
      });
    }
    const match = /documents\/users\/([^/]+)\/accounts\/([^/?]+)/.exec(url);
    if (!match) return new Response("{}", { status: 404 });
    const [, uid, accountId] = match;
    // The real Firestore is reached with the caller's own token; a request
    // without it must never look like a read that succeeded.
    const authorization = (init?.headers as Record<string, string> | undefined)
      ?.Authorization;
    if (!authorization) return new Response("{}", { status: 401 });
    if (!(firestore.accounts[uid] ?? []).includes(accountId)) {
      return new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), {
        status: 404,
      });
    }
    return new Response(
      JSON.stringify({ name: `projects/p/databases/(default)/documents/users/${uid}/accounts/${accountId}` }),
      { status: 200 }
    );
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
      remove: vi.fn(async () => undefined),
      ...storage,
    },
  };
  return { deps, fetchMock };
}

function request(
  body: unknown,
  token: string | null = tokenFor(OWNER),
  method = "POST"
): Request {
  return new Request("https://edge.example/spendly-files", {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const ONE_ACCOUNT: FirestoreState = { accounts: { [OWNER]: ["acc1"], [OTHER]: ["acc9"] } };

describe("ownerForPath", () => {
  it("reads the uid and account out of a well-formed path", () => {
    expect(ownerForPath(OWNER_DOC)).toEqual({ uid: OWNER, accountId: "acc1" });
  });

  it.each([
    ["a traversal", `users/${OWNER}/accounts/acc1/../../other/x.pdf`],
    ["a leading slash", `/users/${OWNER}/accounts/acc1/doc1/x.pdf`],
    ["a wrong root", `pandals/${OWNER}/accounts/acc1/doc1/x.pdf`],
    ["a wrong second segment", `users/${OWNER}/notes/acc1/doc1/x.pdf`],
    ["too few segments", `users/${OWNER}/accounts/acc1/x.pdf`],
    ["too many segments", `users/${OWNER}/accounts/acc1/doc1/sub/x.pdf`],
    ["an unsafe uid segment", `users/../accounts/acc1/doc1/x.pdf`],
    ["an unsafe file name", `users/${OWNER}/accounts/acc1/doc1/x y.pdf`],
    ["an empty path", ""],
    ["a non-string", 42],
  ])("rejects %s", (_label, path) => {
    expect(ownerForPath(path)).toBeNull();
  });

  it("rejects an absurdly long path", () => {
    expect(ownerForPath(`users/${OWNER}/accounts/acc1/doc1/${"a".repeat(600)}.pdf`)).toBeNull();
  });
});

describe("uidFromToken", () => {
  it("reads user_id", () => {
    expect(uidFromToken(tokenFor(OWNER))).toBe(OWNER);
  });

  it("returns null for a malformed token rather than throwing", () => {
    expect(uidFromToken("not-a-token")).toBeNull();
    expect(uidFromToken("")).toBeNull();
    expect(uidFromToken("a.!!!.c")).toBeNull();
  });

  it("refuses a uid that would not be safe in a path", () => {
    const payload = Buffer.from(JSON.stringify({ user_id: "../etc" })).toString(
      "base64url"
    );
    expect(uidFromToken(`h.${payload}.s`)).toBeNull();
  });
});

describe("the caller's own documents", () => {
  it("mints an upload URL", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({
        operation: "upload",
        path: OWNER_DOC,
        contentType: "application/pdf",
        declaredSize: 1024,
      }),
      deps
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      path: OWNER_DOC,
      token: "upload-token",
    });
  });

  it("mints a download URL with the short TTL", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
    expect(deps.storage.createSignedUrl).toHaveBeenCalledWith(
      OWNER_DOC,
      DOWNLOAD_URL_TTL_SECONDS
    );
  });

  it("deletes", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "delete", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(200);
    expect(deps.storage.remove).toHaveBeenCalledWith([OWNER_DOC]);
  });

  it("reaches Firestore with the caller's own token", async () => {
    const { deps, fetchMock } = makeDeps(ONE_ACCOUNT);
    await handleSpendlyFiles(request({ operation: "download", path: OWNER_DOC }), deps);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${tokenFor(OWNER)}`
    );
  });
});

describe("somebody else's documents", () => {
  // The heart of the feature: these are bank statements, and the only thing
  // standing between one user's and another's is this check.
  it.each(["upload", "download", "delete"] as const)(
    "refuses to %s another user's document",
    async (operation) => {
      const { deps } = makeDeps(ONE_ACCOUNT);
      const response = await handleSpendlyFiles(
        request({ operation, path: OTHER_DOC }),
        deps
      );
      expect(response.status).toBe(403);
      expect(deps.storage.createSignedUrl).not.toHaveBeenCalled();
      expect(deps.storage.createSignedUploadUrl).not.toHaveBeenCalled();
      expect(deps.storage.remove).not.toHaveBeenCalled();
    }
  );

  // A foreign path is refused before any Firestore read, so this endpoint
  // cannot be used to probe whether another user's account id exists.
  it("does not consult Firestore about another user's path at all", async () => {
    const { deps, fetchMock } = makeDeps(ONE_ACCOUNT);
    await handleSpendlyFiles(request({ operation: "download", path: OTHER_DOC }), deps);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers identically for a foreign account that does not exist", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const real = await handleSpendlyFiles(
      request({ operation: "download", path: OTHER_DOC }),
      deps
    );
    const imaginary = await handleSpendlyFiles(
      request({
        operation: "download",
        path: `users/${OTHER}/accounts/nope/doc1/statement.pdf`,
      }),
      deps
    );
    expect(real.status).toBe(imaginary.status);
    await expect(real.json()).resolves.toEqual(await imaginary.json());
  });

  it("refuses an account the caller does not own even under their own uid", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({
        operation: "download",
        path: `users/${OWNER}/accounts/not-mine/doc1/statement.pdf`,
      }),
      deps
    );
    expect(response.status).toBe(403);
  });

  // A 200 with no document is not proof of anything, and must not be read as one.
  it("refuses when Firestore answers 200 with an empty body", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    deps.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(403);
  });
});

describe("tokens", () => {
  it("asks an unauthenticated caller to sign in rather than denying them", async () => {
    const { deps } = makeDeps({ accounts: { [OWNER]: ["acc1"] }, rejectToken: true });
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(401);
  });

  it("refuses a request with no Authorization header", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: OWNER_DOC }, null),
      deps
    );
    expect(response.status).toBe(401);
  });

  it("refuses a token whose payload is not readable", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: OWNER_DOC }, "garbage"),
      deps
    );
    expect(response.status).toBe(401);
  });
});

describe("malformed requests", () => {
  it("rejects a non-POST", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(request({}, tokenFor(OWNER), "GET"), deps);
    expect(response.status).toBe(405);
  });

  it("answers the CORS preflight", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      new Request("https://edge.example/spendly-files", { method: "OPTIONS" }),
      deps
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects an unknown operation", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "list", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(400);
  });

  it("rejects a malformed path", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: "users/../../x" }),
      deps
    );
    expect(response.status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      new Request("https://edge.example/spendly-files", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFor(OWNER)}` },
        body: "not json",
      }),
      deps
    );
    expect(response.status).toBe(400);
  });
});

describe("declared upload limits", () => {
  // Advisory, not enforcement — the bucket is the enforcement. The value of
  // checking here is a clear error before a slow upload, and no URL minted.
  it("refuses a disallowed declared type", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({
        operation: "upload",
        path: OWNER_DOC,
        contentType: "application/x-msdownload",
      }),
      deps
    );
    expect(response.status).toBe(415);
    expect(deps.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a declared size over the cap", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({
        operation: "upload",
        path: OWNER_DOC,
        contentType: "application/pdf",
        declaredSize: MAX_UPLOAD_BYTES + 1,
      }),
      deps
    );
    expect(response.status).toBe(413);
    expect(deps.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  // Builds already in users' hands may send neither field; rejecting those
  // would break uploads in the field for no security gain.
  it("allows an upload that declares nothing", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    const response = await handleSpendlyFiles(
      request({ operation: "upload", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(200);
  });

  it("accepts every type the bucket allows", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT);
    for (const contentType of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]) {
      const response = await handleSpendlyFiles(
        request({ operation: "upload", path: OWNER_DOC, contentType }),
        deps
      );
      expect(response.status).toBe(200);
    }
  });
});

describe("storage failures", () => {
  // A storage error can name buckets and keys; the caller gets none of it.
  it("does not echo the storage error back to the caller", async () => {
    const { deps } = makeDeps(ONE_ACCOUNT, {
      createSignedUrl: vi.fn(async () => {
        throw new Error("bucket spendly-files object doc1 missing at internal/path");
      }),
    });
    const response = await handleSpendlyFiles(
      request({ operation: "download", path: OWNER_DOC }),
      deps
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Storage is unavailable right now.");
    expect(body.error).not.toMatch(/bucket|internal/);
  });
});
