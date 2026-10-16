import { describe, expect, it } from "vitest";

import { dashboardAccountCards } from "./dashboardAccountCards";

const EMPTY = {
  liquidBankAssets: 0,
  creditCardLiabilities: 0,
  investmentsValue: 0,
  totalStocksValue: 0,
  epfValue: 0,
  epfUnreconciledCount: 0,
  borrowingLiabilities: 0,
  receivableAssets: 0,
  bankOverdraftLiabilities: 0,
};

describe("dashboardAccountCards", () => {
  it("always shows bank & cash, even at zero, and nothing else", () => {
    const cards = dashboardAccountCards(EMPTY, true);
    expect(cards.map((c) => c.key)).toEqual(["bank"]);
    expect(cards[0].value).toBe(0);
  });

  it("passes summary values through untouched", () => {
    const cards = dashboardAccountCards(
      {
        ...EMPTY,
        liquidBankAssets: 29438.5,
        creditCardLiabilities: 1200.25,
        totalStocksValue: 50000,
        borrowingLiabilities: 7000,
      },
      true
    );
    expect(cards.map((c) => [c.key, c.value])).toEqual([
      ["bank", 29438.5],
      ["cards", 1200.25],
      ["stocks", 50000],
      ["loans", 7000],
    ]);
  });

  it("marks liabilities as owed so the UI never relies on colour alone", () => {
    const cards = dashboardAccountCards(
      { ...EMPTY, creditCardLiabilities: 1, borrowingLiabilities: 1, bankOverdraftLiabilities: 1, receivableAssets: 1 },
      true
    );
    const owed = Object.fromEntries(cards.map((c) => [c.key, c.owed]));
    expect(owed).toEqual({ bank: false, cards: true, lent: false, loans: true, overdraft: true });
  });

  it("drops investment routes when the investments hub is off", () => {
    const values = { ...EMPTY, investmentsValue: 1, totalStocksValue: 1, epfValue: 1 };
    const on = dashboardAccountCards(values, true);
    const off = dashboardAccountCards(values, false);
    expect(on.find((c) => c.key === "epf")?.route).toBe("/investments?tab=epf");
    for (const key of ["deposits", "stocks", "epf"]) {
      expect(off.find((c) => c.key === key)?.route).toBeNull();
    }
    expect(off.find((c) => c.key === "bank")?.route).toBe("/ledger?tab=accounts");
  });

  it("labels EPF as simulated while any month is unreconciled", () => {
    const sim = dashboardAccountCards({ ...EMPTY, epfValue: 10, epfUnreconciledCount: 2 }, true);
    const real = dashboardAccountCards({ ...EMPTY, epfValue: 10 }, true);
    expect(sim.find((c) => c.key === "epf")?.caption).toBe("Simulated");
    expect(real.find((c) => c.key === "epf")?.caption).toBeUndefined();
  });
});
