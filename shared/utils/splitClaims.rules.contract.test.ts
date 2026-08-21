/**
 * Contract test for the `splitShareClaims` rules in `firestore.rules`.
 *
 * THIS FILE DOES NOT EXECUTE FIRESTORE RULES. There is no emulator in CI
 * (`vitest.config.ts` covers only `shared/`, `services/` and `lib/`), so
 * `claimPassesRules` below is a HAND-WRITTEN MIRROR of the `allow create`
 * clauses and has to be updated by hand whenever those rules change.
 *
 * What it does buy:
 *  1. Every payload `buildSplitClaimPayload` can produce passes the mirror, so
 *     the client never knowingly constructs a write the server will reject.
 *  2. Each individual clause is shown to be violable and caught, so a clause
 *     deleted from the mirror (and, by inspection, from the rules) fails a test
 *     rather than silently widening the only unauthenticated write in the app.
 *  3. The field whitelist is asserted equal to the one the client emits, which
 *     is what catches schema/rules drift.
 *
 * Mirrored from the `match /splitShareClaims/{claimId}` block. Follows the
 * precedent set by `lib/duressPath.contract.test.ts`.
 */

import { describe, expect, it } from "vitest";

import type { SplitPublicShare } from "@/shared/types/splitPublicShare";
import {
  SPLIT_CLAIM_CLOCK_SKEW_MS,
  SPLIT_CLAIM_FIELDS,
  buildSplitClaimPayload,
} from "./splitClaims";

/** The literal list in `claimFields()` in firestore.rules. */
const RULES_CLAIM_FIELDS = [
  "shareId",
  "slug",
  "participantKey",
  "type",
  "amount",
  "status",
  "createdAt",
  "updatedAt",
];

type RuleResult = { ok: true } | { ok: false; violation: string };

/** Mirror of `wellFormed() && matchesLiveShare()` for `allow create`. */
function claimPassesRules(params: {
  docId: string;
  payload: Record<string, unknown>;
  /** The parent `splitPublicShares` document, or null when it does not exist. */
  share: Record<string, unknown> | null;
  nowMs: number;
}): RuleResult {
  const d = params.payload;
  const keys = Object.keys(d);

  // d.keys().hasOnly(claimFields()) && d.keys().hasAll(claimFields())
  for (const key of keys) {
    if (!RULES_CLAIM_FIELDS.includes(key)) {
      return { ok: false, violation: `extra field: ${key}` };
    }
  }
  for (const key of RULES_CLAIM_FIELDS) {
    if (!keys.includes(key)) {
      return { ok: false, violation: `missing field: ${key}` };
    }
  }

  const isString = (v: unknown): v is string => typeof v === "string";
  const isInt = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v);

  if (!isString(d.shareId) || d.shareId.length === 0 || d.shareId.length > 64) {
    return { ok: false, violation: "shareId size" };
  }
  if (!isString(d.slug) || d.slug.length < 6 || d.slug.length > 64) {
    return { ok: false, violation: "slug size" };
  }
  if (
    !isString(d.participantKey) ||
    d.participantKey.length === 0 ||
    d.participantKey.length > 64
  ) {
    return { ok: false, violation: "participantKey size" };
  }
  if (d.type !== "paid" && d.type !== "optOut") {
    return { ok: false, violation: "type not in enum" };
  }
  // `d.amount is number && d.amount >= 0` — NaN fails every comparison, and
  // Infinity is caught by the claimAmountMax bound below.
  if (typeof d.amount !== "number" || !(d.amount >= 0)) {
    return { ok: false, violation: "amount not a non-negative number" };
  }
  if (d.status !== "pending") {
    return { ok: false, violation: "status not pending" };
  }
  if (!isInt(d.createdAt) || !isInt(d.updatedAt)) {
    return { ok: false, violation: "timestamps not ints" };
  }
  if (d.createdAt !== d.updatedAt) {
    return { ok: false, violation: "createdAt != updatedAt" };
  }
  if (
    !(d.createdAt > params.nowMs - SPLIT_CLAIM_CLOCK_SKEW_MS) ||
    !(d.createdAt < params.nowMs + SPLIT_CLAIM_CLOCK_SKEW_MS)
  ) {
    return { ok: false, violation: "createdAt outside the skew window" };
  }

  // matchesLiveShare()
  if (params.share === null) {
    return { ok: false, violation: "parent share does not exist" };
  }
  const s = params.share;
  if (params.docId !== `${d.shareId}__${d.participantKey}`) {
    return { ok: false, violation: "docId does not match shareId__participantKey" };
  }
  if (s.claimsEnabled !== true) {
    return { ok: false, violation: "claimsEnabled is not true" };
  }
  if (s.slug !== d.slug) {
    return { ok: false, violation: "slug does not match the share" };
  }
  if (!Array.isArray(s.claimKeys) || !s.claimKeys.includes(d.participantKey)) {
    return { ok: false, violation: "participantKey not in claimKeys" };
  }
  if (!(d.amount <= (s.claimAmountMax as number))) {
    return { ok: false, violation: "amount over claimAmountMax" };
  }
  if (s.status === "settled" || s.status === "spent") {
    return { ok: false, violation: "share is closed" };
  }

  return { ok: true };
}

const NOW = 1_700_000_000_000;

function liveShare(over: Partial<SplitPublicShare> = {}): SplitPublicShare {
  return {
    id: "share1",
    slug: "dinner42",
    splitId: "s1",
    createdBy: "me",
    title: "Dinner",
    kind: "bill",
    totalAmount: 300,
    organizerName: "Kesava",
    status: "open",
    currency: "INR",
    claimKeys: ["p_alice", "p_bob"],
    claimAmountMax: 300,
    claimsEnabled: true,
    updatedAt: NOW,
    participants: [],
    ...over,
  };
}

function validClaim(): { docId: string; payload: Record<string, unknown> } {
  const built = buildSplitClaimPayload({
    share: liveShare(),
    participantKey: "p_alice",
    type: "paid",
    amount: 100,
    now: NOW,
  });
  if ("error" in built) throw new Error("fixture should be valid");
  return built;
}

function check(
  mutate: (c: { docId: string; payload: Record<string, unknown> }) => void,
  share: Record<string, unknown> | null = liveShare() as unknown as Record<
    string,
    unknown
  >
): RuleResult {
  const c = validClaim();
  mutate(c);
  return claimPassesRules({ ...c, share, nowMs: NOW });
}

describe("splitShareClaims rules contract", () => {
  it("keeps the client field list identical to the rules field list", () => {
    expect([...SPLIT_CLAIM_FIELDS].sort()).toEqual([...RULES_CLAIM_FIELDS].sort());
  });

  it("accepts every payload the client can build", () => {
    for (const type of ["paid", "optOut"] as const) {
      for (const key of ["p_alice", "p_bob"]) {
        const built = buildSplitClaimPayload({
          share: liveShare(),
          participantKey: key,
          type,
          amount: type === "paid" ? 100 : 0,
          now: NOW,
        });
        expect("error" in built).toBe(false);
        if ("error" in built) continue;
        expect(
          claimPassesRules({
            ...built,
            share: liveShare() as unknown as Record<string, unknown>,
            nowMs: NOW,
          })
        ).toEqual({ ok: true });
      }
    }
  });

  it("accepts the boundary amount exactly at claimAmountMax", () => {
    const built = buildSplitClaimPayload({
      share: liveShare(),
      participantKey: "p_alice",
      type: "paid",
      amount: 300,
      now: NOW,
    });
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(
      claimPassesRules({
        ...built,
        share: liveShare() as unknown as Record<string, unknown>,
        nowMs: NOW,
      })
    ).toEqual({ ok: true });
  });

  describe("each clause is individually violable and caught", () => {
    const cases: Array<[string, () => RuleResult]> = [
      ["extra field", () => check((c) => void (c.payload.note = "pay me instead"))],
      ["missing field", () => check((c) => void delete c.payload.slug)],
      ["unknown type", () => check((c) => void (c.payload.type = "refund"))],
      ["negative amount", () => check((c) => void (c.payload.amount = -1))],
      ["NaN amount", () => check((c) => void (c.payload.amount = Number.NaN))],
      [
        "Infinity amount",
        () => check((c) => void (c.payload.amount = Number.POSITIVE_INFINITY)),
      ],
      ["amount over the cap", () => check((c) => void (c.payload.amount = 1e308))],
      [
        "amount just over the cap",
        () => check((c) => void (c.payload.amount = 300.01)),
      ],
      ["string amount", () => check((c) => void (c.payload.amount = "100"))],
      ["pre-applied status", () => check((c) => void (c.payload.status = "applied"))],
      [
        "mismatched timestamps",
        () => check((c) => void (c.payload.updatedAt = NOW + 1)),
      ],
      [
        "createdAt far in the past",
        () =>
          check((c) => {
            c.payload.createdAt = NOW - 600_000;
            c.payload.updatedAt = NOW - 600_000;
          }),
      ],
      [
        "createdAt far in the future",
        () =>
          check((c) => {
            c.payload.createdAt = NOW + 600_000;
            c.payload.updatedAt = NOW + 600_000;
          }),
      ],
      [
        "non-integer createdAt",
        () =>
          check((c) => {
            c.payload.createdAt = NOW + 0.5;
            c.payload.updatedAt = NOW + 0.5;
          }),
      ],
      ["slug shorter than 6", () => check((c) => void (c.payload.slug = "abc"))],
      [
        "oversized shareId",
        () => check((c) => void (c.payload.shareId = "x".repeat(100))),
      ],
      [
        "oversized participantKey",
        () => check((c) => void (c.payload.participantKey = "k".repeat(100))),
      ],
      ["empty participantKey", () => check((c) => void (c.payload.participantKey = ""))],
      [
        "docId not derived from the payload",
        () => check((c) => void (c.docId = "share1__someone_else")),
      ],
      [
        "slug not matching the share",
        () =>
          check(
            (c) => void (c.payload.slug = "otherslug"),
            liveShare() as unknown as Record<string, unknown>
          ),
      ],
      [
        "participantKey not published",
        () =>
          check(
            (c) => {
              c.payload.participantKey = "p_stranger";
              c.docId = "share1__p_stranger";
            },
            liveShare() as unknown as Record<string, unknown>
          ),
      ],
      ["parent share missing", () => check(() => undefined, null)],
      [
        "claimsEnabled absent",
        () =>
          check(
            () => undefined,
            liveShare({ claimsEnabled: undefined }) as unknown as Record<
              string,
              unknown
            >
          ),
      ],
      [
        "claimsEnabled false",
        () =>
          check(
            () => undefined,
            liveShare({ claimsEnabled: false }) as unknown as Record<string, unknown>
          ),
      ],
      [
        "share settled",
        () =>
          check(
            () => undefined,
            liveShare({ status: "settled" }) as unknown as Record<string, unknown>
          ),
      ],
      [
        "share spent",
        () =>
          check(
            () => undefined,
            liveShare({ status: "spent" }) as unknown as Record<string, unknown>
          ),
      ],
    ];

    it.each(cases)("rejects: %s", (_label, run) => {
      const result = run();
      expect(result.ok).toBe(false);
    });
  });

  it("cannot be satisfied by a second write to the same slot", () => {
    // The rules only grant `create`; an existing document turns a client setDoc
    // into an `update`, which is denied. The client mirrors that by refusing to
    // build a payload when it already knows about a pending claim.
    const built = buildSplitClaimPayload({
      share: liveShare(),
      participantKey: "p_alice",
      type: "paid",
      amount: 100,
      now: NOW,
      existing: {
        shareId: "share1",
        slug: "dinner42",
        participantKey: "p_alice",
        type: "paid",
        amount: 100,
        status: "pending",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    expect("error" in built).toBe(true);
  });
});
