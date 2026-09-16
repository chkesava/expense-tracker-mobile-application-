import { describe, expect, it } from "vitest";

import {
  buildTokenLadduExport,
  tokenLadduFileName,
  tokenLadduToHtml,
} from "./ganeshTokenLadduExport";
import { readTokenCapacity } from "./ganeshTokenLaddu";
import type { TokenLadduToken } from "@/shared/types/ganeshTokenLaddu";

function token(overrides: Partial<TokenLadduToken> & { id: string; tokenNumber: number }) {
  return {
    status: "eligible",
    registrationId: "reg-1",
    participantName: "Anjali",
    mobile: "9000000000",
    receiptNumberPhysical: "A-101",
    date: "2026-09-05",
    amount: 100,
    paymentMethod: "cash",
    createdBy: "u-1",
    updatedBy: "u-1",
    ...overrides,
  } as TokenLadduToken;
}

const CAPACITY = readTokenCapacity({ totalTokens: 10, registeredCount: 5, cancelledCount: 1 });

function build(tokens: TokenLadduToken[], capacity = CAPACITY) {
  return buildTokenLadduExport({
    pandalName: "Telephone Exchange Youth",
    festivalName: "Ganesh Utsav",
    festivalYear: 2026,
    generatedAt: "2026-09-16T10:30:00.000Z",
    generatedBy: "Treasurer",
    tokens,
    capacity,
  });
}

describe("buildTokenLadduExport — ordering", () => {
  it("orders by token number regardless of the order it was handed", () => {
    // Stable ordering matters because a committee may already have printed an
    // earlier copy; re-exporting must not reshuffle the page.
    const model = build([
      token({ id: "TKN26-000003", tokenNumber: 3 }),
      token({ id: "TKN26-000001", tokenNumber: 1 }),
      token({ id: "TKN26-000002", tokenNumber: 2 }),
    ]);
    expect(model.rows.map((row) => row.tokenId)).toEqual([
      "TKN26-000001",
      "TKN26-000002",
      "TKN26-000003",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const tokens = [
      token({ id: "TKN26-000002", tokenNumber: 2 }),
      token({ id: "TKN26-000001", tokenNumber: 1 }),
    ];
    build(tokens);
    expect(tokens[0].tokenNumber).toBe(2);
  });
});

describe("buildTokenLadduExport — a purchase of five", () => {
  it("lists all five token ids against the one receipt and person", () => {
    const five = [1, 2, 3, 4, 5].map((n) =>
      token({
        id: `TKN26-00000${n}`,
        tokenNumber: n,
        registrationId: "reg-9",
        participantName: "Ramesh",
        receiptNumberPhysical: "B-207",
        amount: 100,
      })
    );
    const model = build(five);

    expect(model.rows).toHaveLength(5);
    expect(new Set(model.rows.map((row) => row.tokenId)).size).toBe(5);
    for (const row of model.rows) {
      expect(row.receiptNumberPhysical).toBe("B-207");
      expect(row.participantName).toBe("Ramesh");
    }

    const html = tokenLadduToHtml(model);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`TKN26-00000${n}`);
    }
  });
});

describe("buildTokenLadduExport — totals", () => {
  it("counts each status and sums the money", () => {
    const model = build([
      token({ id: "TKN26-000001", tokenNumber: 1, status: "eligible", amount: 100 }),
      token({ id: "TKN26-000002", tokenNumber: 2, status: "winner", amount: 100 }),
      token({ id: "TKN26-000003", tokenNumber: 3, status: "cancelled", amount: 50 }),
    ]);

    expect(model.totals.registered).toBe(3);
    expect(model.totals.eligible).toBe(1);
    expect(model.totals.winners).toBe(1);
    expect(model.totals.cancelled).toBe(1);
    // Cancelled money is still money that was taken; reversing it is the
    // ledger's job, not this document's.
    expect(model.totals.amount).toBe(250);
  });

  it("derives the count from the rows, not the config counter", () => {
    // If the two ever disagree, the page must agree with the lines printed on
    // it rather than with a counter the reader cannot see.
    const model = build(
      [token({ id: "TKN26-000001", tokenNumber: 1 })],
      readTokenCapacity({ totalTokens: 10, registeredCount: 99 })
    );
    expect(model.totals.registered).toBe(1);
    expect(model.totals.remaining).toBe(9);
  });

  it("never reports negative room", () => {
    const model = build(
      [1, 2, 3].map((n) => token({ id: `TKN26-00000${n}`, tokenNumber: n })),
      readTokenCapacity({ totalTokens: 2, registeredCount: 3 })
    );
    expect(model.totals.remaining).toBe(0);
  });

  it("handles fractional shares without drifting", () => {
    const model = build([
      token({ id: "TKN26-000001", tokenNumber: 1, amount: 33.34 }),
      token({ id: "TKN26-000002", tokenNumber: 2, amount: 33.33 }),
      token({ id: "TKN26-000003", tokenNumber: 3, amount: 33.33 }),
    ]);
    expect(model.totals.amount).toBe(100);
  });
});

describe("tokenLadduToHtml", () => {
  const model = build([
    token({ id: "TKN26-000001", tokenNumber: 1, status: "winner" }),
    token({ id: "TKN26-000002", tokenNumber: 2, status: "cancelled" }),
  ]);
  const html = tokenLadduToHtml(model);

  it("carries the pandal and festival context and the generation stamp", () => {
    expect(html).toContain("Telephone Exchange Youth");
    expect(html).toContain("Ganesh Utsav 2026");
    expect(html).toContain("2026-09-16T10:30:00.000Z");
    expect(html).toContain("Treasurer");
  });

  it("prints every column KAN-125 asks for", () => {
    for (const header of ["Token", "Receipt", "Name", "Mobile", "Date", "Payment", "Status"]) {
      expect(html).toContain(`<th>${header}</th>`);
    }
    // Amount is right-aligned, so it carries a class.
    expect(html).toContain(`<th class="num">Amount</th>`);
    expect(html).toContain("A-101");
    expect(html).toContain("9000000000");
    expect(html).toContain("Cash");
  });

  it("shows status in words, so a winner is obvious on paper", () => {
    expect(html).toContain("Winner");
    expect(html).toContain("Cancelled");
  });

  it("repeats the header across pages and keeps rows whole", () => {
    // Without these a 500-token register is unreadable past page one.
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("page-break-inside: avoid");
  });

  it("escapes a name that would otherwise break the markup", () => {
    const risky = build([
      token({
        id: "TKN26-000001",
        tokenNumber: 1,
        participantName: '<script>alert("x")</script>',
      }),
    ]);
    const out = tokenLadduToHtml(risky);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("says so plainly when nothing is registered yet", () => {
    const empty = tokenLadduToHtml(build([]));
    expect(empty).toContain("No Token Laddus have been registered yet.");
    expect(empty).not.toContain("<tbody>");
  });

  it("stays a single well-formed document for a large pot", () => {
    const many = Array.from({ length: 500 }, (_, index) =>
      token({ id: `TKN26-${String(index + 1).padStart(6, "0")}`, tokenNumber: index + 1 })
    );
    const big = tokenLadduToHtml(build(many, readTokenCapacity({ totalTokens: 500, registeredCount: 500 })));
    expect((big.match(/<tbody>/g) ?? []).length).toBe(1);
    // Every token gets its own row. The summary table above contributes rows of
    // its own, so count only what is inside the register's tbody.
    const tbody = big.slice(big.indexOf("<tbody>"), big.indexOf("</tbody>"));
    expect((tbody.match(/<tr>/g) ?? []).length).toBe(500);
    expect(big).toContain("TKN26-000001");
    expect(big).toContain("TKN26-000500");
  });
});

describe("tokenLadduFileName", () => {
  it("names the file so it is recognisable months later", () => {
    expect(tokenLadduFileName(build([]))).toBe(
      "Telephone-Exchange-Youth-token-laddu-2026-09-16.pdf"
    );
  });

  it("strips characters a filesystem would refuse", () => {
    const model = buildTokenLadduExport({
      pandalName: "Shri/Ganesh: Mandal *2026*",
      festivalName: "Utsav",
      generatedAt: "2026-09-16T10:30:00.000Z",
      generatedBy: "Treasurer",
      tokens: [],
      capacity: CAPACITY,
    });
    expect(tokenLadduFileName(model)).toBe("Shri-Ganesh-Mandal-2026-token-laddu-2026-09-16.pdf");
  });
});
