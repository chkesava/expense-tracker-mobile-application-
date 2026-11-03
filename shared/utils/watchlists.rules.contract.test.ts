import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { WATCHLIST_EXCHANGES, WATCHLIST_INSTRUMENT_TYPES, WATCHLIST_LIMITS } from "../types/watchlist";
import { WATCHLIST_ID_PATTERN, WATCHLIST_SYMBOL_PATTERN, watchlistDoc, watchlistItemDoc } from "./watchlists";

/** SPENDLY-654: the watchlist documents and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const listBody = rules.slice(rules.indexOf("function watchlistWellFormed("), rules.indexOf("function watchlistItemWellFormed("));
const itemBody = rules.slice(rules.indexOf("function watchlistItemWellFormed("), rules.indexOf("match /watchlists/{listId}"));
const quoted = (body: string, re: RegExp) => [...(body.match(re)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);

const TS = "ts";
const fullList = watchlistDoc("default", "x", TS, { importedLegacyAt: TS });
const fullItem = watchlistItemDoc({ yahooSymbol: "TCS.NS", name: "x", exchange: "NSE", instrumentType: "stock", order: 1 }, TS);

describe("watchlist rules contract", () => {
  it("allows exactly the list fields the app writes", () => {
    expect(quoted(listBody, /hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(fullList).sort());
    const required = quoted(listBody, /hasAll\(\[([^\]]*)\]\)/).sort();
    expect(required).toEqual(Object.keys(watchlistDoc("wl_1", "x", TS)).sort());
  });

  it("allows exactly the item fields the app writes, all required", () => {
    expect(quoted(itemBody, /hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(fullItem).sort());
    expect(quoted(itemBody, /hasAll\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(fullItem).sort());
  });

  it("matches enums, limits and patterns", () => {
    expect(quoted(itemBody, /d\.exchange in \[([^\]]*)\]/)).toEqual([...WATCHLIST_EXCHANGES]);
    expect(quoted(itemBody, /d\.instrumentType in \[([^\]]*)\]/)).toEqual([...WATCHLIST_INSTRUMENT_TYPES]);
    expect(listBody).toContain(`d.name.size() <= ${WATCHLIST_LIMITS.name}`);
    expect(itemBody).toContain(`d.name.size() <= ${WATCHLIST_LIMITS.itemName}`);
    expect(itemBody).toContain(`d.symbol.size() <= ${WATCHLIST_LIMITS.symbol}`);
    expect(itemBody).toContain(`d.order > -${WATCHLIST_LIMITS.orderBound} && d.order < ${WATCHLIST_LIMITS.orderBound}`);
    expect(itemBody).toContain(`itemId.matches('${WATCHLIST_SYMBOL_PATTERN.source}')`);
    expect(listBody).toContain(`listId.matches('${WATCHLIST_ID_PATTERN.source}')`);
    expect(itemBody).toContain("d.yahooSymbol == itemId");
  });

  it("never allows money, quantity or account fields", () => {
    const allowed = [...quoted(listBody, /hasOnly\(\[([^\]]*)\]\)/), ...quoted(itemBody, /hasOnly\(\[([^\]]*)\]\)/)];
    for (const f of ["amount", "quantity", "averagePrice", "avgBuyPrice", "accountId", "investedValue", "date"]) expect(allowed).not.toContain(f);
  });

  it("is a validated collection, not the catch-all; the legacy list stays as it was", () => {
    const catchAll = rules.slice(rules.indexOf("match /{collection}/{document=**}"));
    const list = catchAll.slice(0, catchAll.indexOf("];"));
    expect(list).not.toContain("'watchlists'");
    expect(list).toContain("'watchlist'");
  });

  it("protects the default list from deletion", () => {
    expect(rules).toContain("allow delete: if isOwner(uid) && listId != 'default';");
  });
});
