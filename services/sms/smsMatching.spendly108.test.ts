import { describe, expect, it } from "vitest";

import {
  isExactSmsAccountMatch,
  preservedSmsAuditFromRow,
  shouldForceSmsMatchReview,
  smsMatchReviewReason,
} from "@/services/sms/smsMatchAudit";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import { routeWriteReady } from "@/services/sms/smsAutoAdd";
import { writeReadyToInboxItems } from "@/services/sms/smsReviewActions";
import type { Account } from "@/shared/types/expense";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const superCard = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  name: "Super Money Credit Card",
  typeId: "type-cc",
  displayName: "Super Money Credit Card",
  institutionId: "super_money",
  accountTypeId: "credit_card",
  last4: "4521",
  smsMatchingEnabled: true,
  ...overrides,
});

const cardSms = (id: string, receivedAtMs: number): RawSmsMessage => ({
  id,
  address: "VM-SUPER",
  body: "INR 899 spent on Super Card ending 4521 at Amazon",
  receivedAtMs,
});

describe("smsMatchAudit policy", () => {
  it("treats AUTO_MATCHED with an accountId as an exact match", () => {
    expect(
      isExactSmsAccountMatch({
        status: "AUTO_MATCHED",
        accountId: "acc-1",
      })
    ).toBe(true);
    expect(
      shouldForceSmsMatchReview({
        status: "AUTO_MATCHED",
        accountId: "acc-1",
      })
    ).toBe(false);
  });

  it("forces review for ambiguous and unmatched resolutions", () => {
    expect(
      shouldForceSmsMatchReview({
        status: "AMBIGUOUS",
        accountId: null,
      })
    ).toBe(true);
    expect(
      shouldForceSmsMatchReview({
        status: "NEEDS_REVIEW",
        accountId: null,
      })
    ).toBe(true);
    expect(smsMatchReviewReason({ status: "AMBIGUOUS" })).toMatch(/Multiple/);
    expect(smsMatchReviewReason({ status: "NEEDS_REVIEW" })).toMatch(/No exact/);
  });

  it("preserves SMS provenance fields when correcting a row", () => {
    const preserved = preservedSmsAuditFromRow({
      smsFingerprint: "fp-1",
      smsExternalRef: "REF123456",
      smsMatchStatus: "AUTO_MATCHED",
      smsMatchConfidence: 0.92,
      smsMatchedSignals: ["last4", "institutionId"],
      amount: 100,
    });
    expect(preserved).toEqual({
      smsFingerprint: "fp-1",
      smsExternalRef: "REF123456",
      smsMatchStatus: "AUTO_MATCHED",
      smsMatchConfidence: 0.92,
      smsMatchedSignals: ["last4", "institutionId"],
    });
  });
});

describe("SPENDLY-108 credit-card SMS matching", () => {
  it("exact-matches a card SMS and keeps match metadata for audit", () => {
    const result = processRawSmsMessages([cardSms("1", 1_000)], {
      accounts: [superCard({ id: "acc-super-cc" })],
    });
    const entry = result.writeReady[0];
    expect(entry?.write.payload.accountId).toBe("acc-super-cc");
    expect(entry?.forceReview).toBeUndefined();
    expect(entry?.record.accountResolution?.status).toBe("AUTO_MATCHED");
    expect(entry?.write.payload.smsMatchStatus).toBe("AUTO_MATCHED");
    expect(entry?.write.payload.smsMatchedSignals).toEqual(
      expect.arrayContaining(["last4", "accountTypeId"])
    );
  });

  it("routes an ambiguous card match to review without attaching an account", () => {
    const result = processRawSmsMessages([cardSms("1", 1_000)], {
      accounts: [
        superCard({ id: "acc-a" }),
        superCard({ id: "acc-b", displayName: "Backup Super" }),
      ],
    });
    const entry = result.writeReady[0];
    expect(entry?.write.payload.accountId).toBeNull();
    expect(entry?.forceReview).toBe(true);
    expect(entry?.record.accountResolution?.status).toBe("AMBIGUOUS");
    expect(entry?.write.payload.smsMatchStatus).toBe("AMBIGUOUS");

    const routed = routeWriteReady(result.writeReady, "auto");
    expect(routed.toCommit).toHaveLength(0);
    expect(routed.toReview).toHaveLength(1);

    const inbox = writeReadyToInboxItems(result.writeReady);
    expect(inbox[0]?.matchReason).toMatch(/Multiple cards/);
  });

  it("keeps unmatched messages visible for review instead of auto-committing", () => {
    const result = processRawSmsMessages([cardSms("1", 1_000)], {
      accounts: [],
    });
    const entry = result.writeReady[0];
    expect(entry?.write.payload.accountId).toBeNull();
    expect(entry?.forceReview).toBe(true);
    expect(entry?.record.accountResolution?.status).toBe("NEEDS_REVIEW");

    const routed = routeWriteReady(result.writeReady, "auto");
    expect(routed.toCommit).toHaveLength(0);
    expect(routed.toReview).toHaveLength(1);

    const inbox = writeReadyToInboxItems(result.writeReady);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.matchReason).toMatch(/No exact card match/);
  });

  it("skips a duplicate SMS so reprocessing cannot create a second financial effect", () => {
    const result = processRawSmsMessages(
      [
        {
          id: "1",
          address: "VM-SUPER",
          body:
            "INR 899 spent on Super Card ending 4521 at Amazon. Ref No 555666777888",
          receivedAtMs: 1_000,
        },
        {
          id: "2",
          address: "VM-SUPER",
          body:
            "INR 899 spent on Super Card ending 4521 at Amazon. Ref No 555666777888",
          receivedAtMs: 2_000,
        },
      ],
      { accounts: [superCard({ id: "acc-super-cc" })] }
    );
    expect(result.writeReady).toHaveLength(1);
    expect(result.records[1]?.skipReason).toBe("duplicate");
  });
});
