import { describe, expect, it, vi } from "vitest";

import {
  ReauthRequiredError,
  runAccountDeletion,
} from "@/services/deleteAccountClient";
import {
  EMPTY_DELETE_COUNTS,
  type DeleteAccountResponse,
} from "@/shared/utils/deleteAccountRemote";

const ORIGIN = "https://share.example";

function reply(
  body: Partial<DeleteAccountResponse> & { error?: string; code?: string },
  status = 200,
) {
  return {
    status,
    json: async () => ({
      done: false,
      phase: "shared",
      cursor: null,
      deleted: { ...EMPTY_DELETE_COUNTS },
      orphanedPandals: [],
      skippedSharedVaults: [],
      failedPaths: [],
      elapsedMs: 1,
      ...body,
    }),
  } as unknown as Response;
}

function deps(responses: Response[]) {
  const fetchFn = vi.fn(async () => responses.shift() ?? reply({ done: true, phase: "complete" }));
  return {
    fetchFn: fetchFn as unknown as typeof fetch,
    idToken: async () => "token",
    origin: ORIGIN,
  };
}

describe("runAccountDeletion", () => {
  it("walks every phase until the server says done", async () => {
    const d = deps([
      reply({ phase: "ganesh" }),
      reply({ phase: "user-tree" }),
      reply({ phase: "duress-tree" }),
      reply({ phase: "auth" }),
      reply({ done: true, phase: "complete" }),
    ]);
    const seen: string[] = [];
    const result = await runAccountDeletion((r) => seen.push(r.phase), d);

    expect(result.done).toBe(true);
    expect(seen).toEqual(["ganesh", "user-tree", "duress-tree", "auth", "complete"]);
  });

  it("carries the phase and cursor forward", async () => {
    const d = deps([
      reply({ phase: "user-tree", cursor: "expenses" }),
      reply({ done: true, phase: "complete" }),
    ]);
    await runAccountDeletion(() => {}, d);

    const second = (d.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(JSON.parse(second[1].body)).toMatchObject({
      phase: "user-tree",
      cursor: "expenses",
    });
  });

  it("sends the confirmation on every call, resumes included", async () => {
    const d = deps([reply({ phase: "ganesh" }), reply({ done: true, phase: "complete" })]);
    await runAccountDeletion(() => {}, d);

    for (const call of (d.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(JSON.parse(call[1].body).confirm).toBe("DELETE");
    }
  });

  it("accumulates counts across phases", async () => {
    const d = deps([
      reply({ phase: "ganesh", deleted: { ...EMPTY_DELETE_COUNTS, splits: 2 } }),
      reply({
        done: true,
        phase: "complete",
        deleted: { ...EMPTY_DELETE_COUNTS, memberships: 3 },
      }),
    ]);
    const result = await runAccountDeletion(() => {}, d);
    expect(result.deleted.splits).toBe(2);
    expect(result.deleted.memberships).toBe(3);
  });

  it("collects orphaned pandals from every phase", async () => {
    const d = deps([
      reply({ phase: "user-tree", orphanedPandals: ["p1"] }),
      reply({ done: true, phase: "complete", orphanedPandals: ["p2"] }),
    ]);
    const result = await runAccountDeletion(() => {}, d);
    expect(result.orphanedPandals).toEqual(["p1", "p2"]);
  });

  it("sends the user back to re-auth rather than retrying", async () => {
    // Only the user can fix a stale login, so retrying would just burn the
    // budget and then show the wrong error.
    const d = deps([reply({ code: "reauth-required", error: "x" }, 401)]);
    await expect(runAccountDeletion(() => {}, d)).rejects.toBeInstanceOf(
      ReauthRequiredError,
    );
    expect(d.fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries a server error, then succeeds", async () => {
    const d = deps([
      reply({ error: "boom" }, 500),
      reply({ done: true, phase: "complete" }),
    ]);
    await expect(runAccountDeletion(() => {}, d)).resolves.toMatchObject({
      done: true,
    });
    expect(d.fetchFn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and never claims success", async () => {
    const d = deps([
      reply({ error: "boom" }, 500),
      reply({ error: "boom" }, 500),
      reply({ error: "boom" }, 500),
      reply({ error: "boom" }, 500),
    ]);
    await expect(runAccountDeletion(() => {}, d)).rejects.toThrow(/still active/i);
  });

  it("retries a thrown network failure", async () => {
    let call = 0;
    const fetchFn = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("offline");
      return reply({ done: true, phase: "complete" });
    });
    await expect(
      runAccountDeletion(() => {}, {
        fetchFn: fetchFn as unknown as typeof fetch,
        idToken: async () => "token",
        origin: ORIGIN,
      }),
    ).resolves.toMatchObject({ done: true });
  });

  it("refuses to run without a configured origin", async () => {
    await expect(
      runAccountDeletion(() => {}, {
        fetchFn: vi.fn() as unknown as typeof fetch,
        idToken: async () => "token",
        origin: "",
      }),
    ).rejects.toThrow(/connection/i);
  });

  it("stops rather than looping forever if the server never finishes", async () => {
    const fetchFn = vi.fn(async () => reply({ phase: "user-tree" }));
    await expect(
      runAccountDeletion(() => {}, {
        fetchFn: fetchFn as unknown as typeof fetch,
        idToken: async () => "token",
        origin: ORIGIN,
      }),
    ).rejects.toThrow(/did not finish/i);
  });

  it("posts to the function url with a bearer token", async () => {
    const d = deps([reply({ done: true, phase: "complete" })]);
    await runAccountDeletion(() => {}, d);
    const [url, init] = (d.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${ORIGIN}/.netlify/functions/delete-account`);
    expect(init.headers.Authorization).toBe("Bearer token");
  });
});
