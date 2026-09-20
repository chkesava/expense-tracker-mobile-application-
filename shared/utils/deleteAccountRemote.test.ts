import { describe, expect, it } from "vitest";

import {
  DELETE_PHASES,
  deleteAccountFunctionUrl,
  deletePhaseLabel,
  isDeletePhase,
  isReauthFresh,
  nextDeletePhase,
  parseDeleteRequest,
  REAUTH_MAX_AGE_SEC,
} from "@/shared/utils/deleteAccountRemote";

describe("deleteAccountFunctionUrl", () => {
  it("builds the function url", () => {
    expect(deleteAccountFunctionUrl("https://share.example")).toBe(
      "https://share.example/.netlify/functions/delete-account",
    );
  });

  it("tolerates a trailing slash", () => {
    expect(deleteAccountFunctionUrl("https://share.example/")).toBe(
      "https://share.example/.netlify/functions/delete-account",
    );
  });

  it("returns empty for an unset origin", () => {
    // A build with no origin configured must not post to a relative path.
    expect(deleteAccountFunctionUrl("")).toBe("");
  });
});

describe("phase ordering", () => {
  it("deletes the auth user last", () => {
    // Load-bearing: after deleteUser the client can never mint another ID
    // token, so anything left would be orphaned with no way back in.
    expect(nextDeletePhase("auth")).toBe("complete");
    expect(DELETE_PHASES[DELETE_PHASES.length - 2]).toBe("auth");
  });

  it("removes other people's visibility first", () => {
    // If it stalls after phase one, the friend-visible splits are gone and
    // only the user's own private data remains.
    expect(DELETE_PHASES[0]).toBe("shared");
  });

  it("walks every phase in order", () => {
    expect(nextDeletePhase("shared")).toBe("ganesh");
    expect(nextDeletePhase("ganesh")).toBe("user-tree");
    expect(nextDeletePhase("user-tree")).toBe("duress-tree");
    expect(nextDeletePhase("duress-tree")).toBe("auth");
  });

  it("deletes the duress tree", () => {
    // The SPENDLY-22 decoy tree is real data; leaving it behind would be the
    // most sensitive thing the deletion missed.
    expect(DELETE_PHASES).toContain("duress-tree");
  });

  it("terminates", () => {
    expect(nextDeletePhase("complete")).toBe("complete");
  });

  it("recognises its own phases and nothing else", () => {
    expect(isDeletePhase("user-tree")).toBe(true);
    expect(isDeletePhase("everything")).toBe(false);
    expect(isDeletePhase(undefined)).toBe(false);
  });

  it("labels every phase", () => {
    for (const phase of DELETE_PHASES) {
      expect(deletePhaseLabel(phase).length).toBeGreaterThan(0);
    }
  });
});

describe("isReauthFresh", () => {
  const now = 1_700_000_000_000;
  const nowSec = Math.floor(now / 1000);

  it("accepts a login from a moment ago", () => {
    expect(isReauthFresh(nowSec - 10, now)).toBe(true);
  });

  it("accepts a login exactly at the limit", () => {
    expect(isReauthFresh(nowSec - REAUTH_MAX_AGE_SEC, now)).toBe(true);
  });

  it("rejects a login one second past the limit", () => {
    expect(isReauthFresh(nowSec - REAUTH_MAX_AGE_SEC - 1, now)).toBe(false);
  });

  it("rejects a day-old session", () => {
    // The whole point: a session that has been open for hours cannot delete.
    expect(isReauthFresh(nowSec - 86_400, now)).toBe(false);
  });

  it("rejects a missing or zero claim", () => {
    // An absent auth_time must never read as fresh.
    expect(isReauthFresh(undefined, now)).toBe(false);
    expect(isReauthFresh(0, now)).toBe(false);
    expect(isReauthFresh(Number.NaN, now)).toBe(false);
  });

  it("tolerates a clock slightly ahead", () => {
    // Server/device skew, not evidence of staleness.
    expect(isReauthFresh(nowSec + 30, now)).toBe(true);
  });
});

describe("parseDeleteRequest", () => {
  it("defaults to the first phase", () => {
    expect(parseDeleteRequest({ confirm: "DELETE" })).toEqual({
      ok: true,
      phase: "shared",
      cursor: null,
    });
  });

  it("carries a resume point", () => {
    expect(
      parseDeleteRequest({ confirm: "DELETE", phase: "user-tree", cursor: "expenses" }),
    ).toEqual({ ok: true, phase: "user-tree", cursor: "expenses" });
  });

  it("requires the confirmation on every call, resumes included", () => {
    // A proxy or client retry must not be able to start a deletion by itself.
    expect(parseDeleteRequest({ phase: "user-tree" }).ok).toBe(false);
    expect(parseDeleteRequest({ confirm: "delete" }).ok).toBe(false);
    expect(parseDeleteRequest({ confirm: "DELETE " }).ok).toBe(false);
  });

  it("rejects an unknown phase", () => {
    expect(parseDeleteRequest({ confirm: "DELETE", phase: "everything" }).ok).toBe(
      false,
    );
  });

  it("rejects a non-object body", () => {
    expect(parseDeleteRequest(null).ok).toBe(false);
    expect(parseDeleteRequest("DELETE").ok).toBe(false);
    expect(parseDeleteRequest(undefined).ok).toBe(false);
  });

  it("treats an empty cursor as absent", () => {
    const parsed = parseDeleteRequest({ confirm: "DELETE", cursor: "" });
    expect(parsed).toMatchObject({ ok: true, cursor: null });
  });
});
