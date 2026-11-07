import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { changeFieldsOf, EXTRA_CHANGE_FIELDS, firestorePathOf, mapDocument, READ_MODEL_TABLES, SPEC_BY_COLLECTION, timestampMillis, toJsonDoc } from "./mapping";

const migrationsDir = path.resolve(__dirname, "../../../supabase-readmodel/supabase/migrations");
const sql = readdirSync(migrationsDir)
  .sort()
  .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
  .join("\n");

const CONTRACT = new Set([
  "uid", "doc_id", "doc", "source_path", "source_update_time", "source_deleted",
  "deleted_at", "schema_version", "mapping_status", "synced_at",
  // SPENDLY-669: who wrote the row (owned by the write functions, not mapped).
  "written_by", "client_written_at",
]);

function tableColumns(table: string): string[] {
  // R2.4: a re-runnable migration may say `create table if not exists`.
  const body = new RegExp(`create table (?:if not exists )?public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? "";
  return body
    .split("\n")
    .map((line) => /^\s+([a-z_]+)\s+[a-z]/.exec(line)?.[1])
    .filter((c): c is string => !!c && c !== "primary");
}

const UPDATE_TIME = { seconds: 1_790_000_000, nanoseconds: 0 };
const expenses = SPEC_BY_COLLECTION.get("expenses")!;

describe("read-model mapping (SPENDLY-506)", () => {
  it.each(READ_MODEL_TABLES.map((s) => [s.table, s] as const))("%s: spec covers exactly the typed columns", (table, spec) => {
    const typed = tableColumns(table).filter((c) => !CONTRACT.has(c));
    expect(typed.length).toBeGreaterThan(0);
    const mapped = [...(spec.parent ? [spec.parent.column] : []), ...spec.fields.map((f) => f.column), ...(spec.derivedMonth ? ["month"] : [])];
    expect([...mapped].sort()).toEqual([...typed].sort());
  });

  it("maps an expense: typed columns, month, contract columns and the full doc", () => {
    const row = mapDocument(expenses, "u1", {
      id: "e1",
      updateTime: UPDATE_TIME,
      data: {
        amount: 1200.5, date: "2026-09-30", month: "2026-10", category: "Food", subcategory: "Groceries",
        accountId: "bank", note: "kept in doc", createdAt: { toMillis: () => 1_790_000_000_000 },
      },
    });
    expect(row).toMatchObject({
      uid: "u1", doc_id: "e1", source_path: "users/u1/expenses/e1", mapping_status: "mapped",
      amount: 1200.5, date: "2026-09-30", month: "2026-10", category: "Food", account_id: "bank",
      credit_card_bill_id: null, soft_deleted_at: null, schema_version: 1,
    });
    expect(row.source_update_time).toBe(new Date(1_790_000_000_000).toISOString());
    expect(row.doc).toMatchObject({ note: "kept in doc", createdAt: new Date(1_790_000_000_000).toISOString() });
  });

  it("SPENDLY-589/668: an 'already deducted' lend has no source account; a legacy one has no source mode", () => {
    const receivables = SPEC_BY_COLLECTION.get("receivables")!;
    const deducted = mapDocument(receivables, "u1", {
      id: "r1",
      updateTime: UPDATE_TIME,
      data: { personType: "FRIEND", personName: "A", originalAmount: 500, lentDate: "2026-10-01", sourceAccountId: null, sourceMode: "already_deducted", outstandingAmount: 500, status: "ACTIVE" },
    });
    expect(deducted).toMatchObject({ source_account_id: null, source_mode: "already_deducted", original_amount: 500, outstanding_amount: 500, mapping_status: "mapped" });
    const legacy = mapDocument(receivables, "u1", { id: "r0", updateTime: UPDATE_TIME, data: { personName: "B", originalAmount: 10, lentDate: "2026-01-01", sourceAccountId: "bank" } });
    expect(legacy).toMatchObject({ source_account_id: "bank", source_mode: null, mapping_status: "mapped" });
  });

  it("SPENDLY-589: repayments take their month from the date; subscriptions type their cadence", () => {
    const repayment = mapDocument(SPEC_BY_COLLECTION.get("borrowingRepayments")!, "u1", {
      id: "br1",
      updateTime: UPDATE_TIME,
      data: { borrowingId: "b1", amount: 1200, principalComponent: 1000, interestComponent: 200, paymentAccountId: "bank", date: "2026-10-05" },
    });
    expect(repayment).toMatchObject({ borrowing_id: "b1", amount: 1200, principal_component: 1000, interest_component: 200, month: "2026-10", mapping_status: "mapped" });
    const subs = SPEC_BY_COLLECTION.get("subscriptions")!;
    const sub = mapDocument(subs, "u1", {
      id: "s1",
      updateTime: UPDATE_TIME,
      data: { name: "Gym", amount: 999, category: "Health", type: "subscription", dayOfMonth: 5, isActive: true, lastProcessed: "2026-10", frequency: "monthly" },
    });
    expect(sub).toMatchObject({ name: "Gym", amount: 999, day_of_month: 5, is_active: true, last_processed: "2026-10", frequency: "monthly", mapping_status: "mapped" });
    // A malformed value is flagged unmapped, never dropped (R2.2).
    const bad = mapDocument(subs, "u1", { id: "s2", updateTime: UPDATE_TIME, data: { name: "X", amount: 1, dayOfMonth: "5th", isActive: true } });
    expect(bad.mapping_status).toBe("unmapped");
  });

  it("SPENDLY-590: quantities, prices and NAVs keep their decimals; money stays money", () => {
    const holding = mapDocument(SPEC_BY_COLLECTION.get("holdings")!, "u1", {
      id: "h1",
      updateTime: UPDATE_TIME,
      data: { profileId: "INE009A01021", symbol: "INFY", yahooSymbol: "INFY.NS", quantity: 12.345678, averageBuyPrice: 1523.12345678, datePurchased: "2026-04-01" },
    });
    expect(holding).toMatchObject({ symbol: "INFY", quantity: 12.345678, average_buy_price: 1523.12345678, date_purchased: "2026-04-01", mapping_status: "mapped" });
    const trade = mapDocument(SPEC_BY_COLLECTION.get("portfolioTransactions")!, "u1", {
      id: "t1",
      updateTime: UPDATE_TIME,
      // An ADJUSTMENT row carries a signed price (holdingAdjustments).
      data: { holdingId: "h1", symbol: "INFY", type: "ADJUSTMENT", quantity: 0, price: -250.5, fees: 0, date: "2026-10-01", orderStatus: "executed" },
    });
    expect(trade).toMatchObject({ holding_id: "h1", type: "ADJUSTMENT", quantity: 0, price: -250.5, fees: 0, mapping_status: "mapped" });
    const fund = mapDocument(SPEC_BY_COLLECTION.get("investments")!, "u1", {
      id: "i1",
      updateTime: UPDATE_TIME,
      data: { name: "Index fund", kind: "mutual_fund", principal: 50000, startDate: "2025-01-10", units: 1234.5678, purchaseNav: 40.5, currentNav: 52.12345, annualInterestRate: 7.1 },
    });
    expect(fund).toMatchObject({ principal: 50000, units: 1234.5678, purchase_nav: 40.5, current_nav: 52.12345, annual_interest_rate: 7.1, mapping_status: "mapped" });
    // Cash balance is a stored copy (R4.1); a non-number flags the row, never drops it.
    const settings = SPEC_BY_COLLECTION.get("portfolioSettings")!;
    expect(mapDocument(settings, "u1", { id: "main", updateTime: UPDATE_TIME, data: { cashBalance: 1200.5, onboardingComplete: true } }))
      .toMatchObject({ cash_balance: 1200.5, onboarding_complete: true, mapping_status: "mapped" });
    expect(mapDocument(settings, "u1", { id: "main", updateTime: UPDATE_TIME, data: { cashBalance: "lots" } }).mapping_status).toBe("unmapped");
  });

  it("SPENDLY-590: maps EPF contributions, their events (from/to) and wage history (createdAtMs)", () => {
    const contribution = mapDocument(SPEC_BY_COLLECTION.get("epfContributions")!, "u1", {
      id: "est1_2026-09",
      updateTime: UPDATE_TIME,
      data: { establishmentId: "est1", month: "2026-09", wage: 15000, employeeShare: 1800, employerShare: 1800, epsShare: 1250, employerEpfShare: 550, totalContribution: 3600, epfCredit: 2350, status: "credited", epsEligible: true },
    });
    expect(contribution).toMatchObject({ establishment_id: "est1", month: "2026-09", eps_share: 1250, epf_credit: 2350, status: "credited", mapping_status: "mapped" });
    const event = mapDocument(SPEC_BY_COLLECTION.get("epfContributionEvents")!, "u1", {
      id: "ev1",
      updateTime: UPDATE_TIME,
      data: { contributionId: "est1_2026-09", establishmentId: "est1", month: "2026-09", from: "none", to: "scheduled", actor: "system", at: "2026-10-01T00:00:00.000Z" },
    });
    expect(event).toMatchObject({ from_status: "none", to_status: "scheduled", actor: "system", at: "2026-10-01T00:00:00.000Z", mapping_status: "mapped" });
    const wage = mapDocument(SPEC_BY_COLLECTION.get("epfWageHistory")!, "u1", {
      id: "w1",
      updateTime: UPDATE_TIME,
      data: { establishmentId: "est1", effectiveFromMonth: "2026-04", wage: 21000, epsEligible: false, createdAtMs: 1_790_000_000_000 },
    });
    expect(wage).toMatchObject({ effective_from_month: "2026-04", wage: 21000, eps_eligible: false, created_at: new Date(1_790_000_000_000).toISOString() });
    // The UAN and name stay in the doc only; the profile types just the active pointer.
    const profile = mapDocument(SPEC_BY_COLLECTION.get("epfProfile")!, "u1", { id: "main", updateTime: UPDATE_TIME, data: { uan: "100000000000", employeeName: "A", activeEstablishmentId: null } });
    expect(profile).toMatchObject({ active_establishment_id: null, mapping_status: "mapped" });
    expect(Object.keys(profile)).not.toContain("uan");
  });

  it("SPENDLY-591: trip and SIP dates are copied verbatim (no UTC day cut); SIP units keep their decimals", () => {
    const trip = mapDocument(SPEC_BY_COLLECTION.get("trips")!, "u1", {
      id: "t1",
      updateTime: UPDATE_TIME,
      data: { destination: "Goa", startDate: "2026-10-31T18:30:00.000Z", endDate: "2026-11-04T18:30:00.000Z", totalBudget: 20000, spentAmount: 4250.5, status: "active" },
    });
    expect(trip).toMatchObject({ start_date: "2026-10-31T18:30:00.000Z", end_date: "2026-11-04T18:30:00.000Z", spent_amount: 4250.5, mapping_status: "mapped" });
    const plan = mapDocument(SPEC_BY_COLLECTION.get("sipPlans")!, "u1", {
      id: "p1",
      updateTime: UPDATE_TIME,
      data: { symbol: "NIFTYBEES", investmentAmount: 5000, totalInvested: 15000, totalUnits: 55.12345678, executionDay: 5, executionCount: 3, nextExecutionDate: "2026-12-04T18:30:00.000Z", skipNextExecution: false, status: "active" },
    });
    expect(plan).toMatchObject({ total_units: 55.12345678, execution_count: 3, next_execution_date: "2026-12-04T18:30:00.000Z", mapping_status: "mapped" });
  });

  it("SPENDLY-591: ms timestamps map; arrays and maps stay in doc only", () => {
    const decision = mapDocument(SPEC_BY_COLLECTION.get("decisions")!, "u1", {
      id: "d1",
      updateTime: UPDATE_TIME,
      data: { title: "Buy a car?", category: "purchase", status: "decided", revision: 2, confidence: 4, createdAtMs: 1_790_000_000_000, decidedAtMs: 1_790_000_100_000, alternatives: [{ id: "a" }], context: { why: "x" } },
    });
    expect(decision).toMatchObject({ revision: 2, confidence: 4, created_at: new Date(1_790_000_000_000).toISOString(), decided_at: new Date(1_790_000_100_000).toISOString(), mapping_status: "mapped" });
    expect(decision).not.toHaveProperty("alternatives");
    expect(decision.doc).toMatchObject({ alternatives: [{ id: "a" }] });
    const month = mapDocument(SPEC_BY_COLLECTION.get("netWorthHistory")!, "u1", {
      id: "2026-10",
      updateTime: UPDATE_TIME,
      data: { month: "2026-10", schemaVersion: 1, points: { "01": { netWorth: 100, assets: 150, liabilities: 50, recordedAtMs: 1 } } },
    });
    // The contract's schema_version is the read model's; the doc's own is history_schema_version.
    expect(month).toMatchObject({ month: "2026-10", history_schema_version: 1, mapping_status: "mapped" });
    expect(month.doc).toMatchObject({ points: { "01": { netWorth: 100 } } });
  });

  it("SPENDLY-591: the users/{uid} copy keeps only allowlisted settings; PIN, lock, role and identity never leave Firestore", () => {
    const settings = SPEC_BY_COLLECTION.get("userSettings")!;
    const row = mapDocument(settings, "u1", {
      id: "u1",
      updateTime: UPDATE_TIME,
      data: {
        currency: "INR", theme: "slate", themeMode: "dark", expensePalette: "forest", monthlyBudget: "45000",
        enableInvestments: true, dashboardOrder: ["a", "b"],
        // Never copied:
        privacyPin: "1234", fakePin: "9999", lockPastMonths: true, lockOnInactivity: true, inactivityTimeout: 5,
        lockOnAppSwitch: true, ghostMode: true, role: "SUPER_ADMIN", username: "kesava", email: "x@y.z",
        displayName: "K", photoURL: "https://p", phone: "+91", avatar: "a1", upiId: "k@upi",
        // The legacy nested map: its settings come along (top level wins), its PINs don't.
        settings: { language: "te", currency: "USD", privacyPin: "1111", fakePin: "2222" },
      },
    });
    expect(row).toMatchObject({
      doc_id: "settings", source_path: "users/u1", currency: "INR", language: "te", theme: "slate", theme_mode: "dark",
      expense_palette: "forest", monthly_budget: 45000, enable_investments: true, mapping_status: "mapped",
    });
    const copied = JSON.stringify(row);
    for (const secret of ["1234", "9999", "1111", "2222", "SUPER_ADMIN", "kesava", "x@y.z", "https://p", "+91", "k@upi"]) {
      expect(copied).not.toContain(secret);
    }
    expect(Object.keys(row.doc as object).sort()).toEqual(
      ["currency", "dashboardOrder", "enableInvestments", "expensePalette", "language", "monthlyBudget", "theme", "themeMode"]
    );
  });

  it("SPENDLY-591: a nested watchlist item keys on '{listId}/{itemId}', with its list id and real path", () => {
    const items = SPEC_BY_COLLECTION.get("watchlists/items")!;
    const row = mapDocument(items, "u1", {
      id: "wl_abc/INFY.NS",
      updateTime: UPDATE_TIME,
      data: { symbol: "INFY", yahooSymbol: "INFY.NS", name: "Infosys", exchange: "NSE", instrumentType: "EQUITY", order: 2.25 },
    });
    expect(row).toMatchObject({
      doc_id: "wl_abc/INFY.NS", list_id: "wl_abc", source_path: "users/u1/watchlists/wl_abc/items/INFY.NS",
      symbol: "INFY", sort_order: 2.25, mapping_status: "mapped",
    });
    expect(firestorePathOf(items, "u1", "wl_abc/INFY.NS")).toBe("users/u1/watchlists/wl_abc/items/INFY.NS");
    // A bad field leaves the row unmapped but keeps the list id (it comes from the path).
    const bad = mapDocument(items, "u1", { id: "wl_abc/X", updateTime: UPDATE_TIME, data: { order: "first" } });
    expect(bad).toMatchObject({ mapping_status: "unmapped", list_id: "wl_abc", sort_order: null });
  });

  it("SPENDLY-609: maps a goal, including a legacy one with an empty deadline and no status", () => {
    const goals = SPEC_BY_COLLECTION.get("financialGoals")!;
    const v2 = mapDocument(goals, "u1", {
      id: "g1",
      updateTime: UPDATE_TIME,
      data: { name: "Car", status: "active", targetAmount: 1000, currentAmount: 250.5, deadline: "2027-01-01", createdAtMs: 1_790_000_000_000, pinned: true, nameKey: "n_car" },
    });
    expect(v2).toMatchObject({
      source_path: "users/u1/financialGoals/g1", mapping_status: "mapped", name: "Car", status: "active",
      target_amount: 1000, current_amount: 250.5, deadline: "2027-01-01", created_at: new Date(1_790_000_000_000).toISOString(), pinned: true,
    });
    expect(v2.doc).toMatchObject({ nameKey: "n_car" });
    const legacy = mapDocument(goals, "u1", { id: "g0", updateTime: UPDATE_TIME, data: { name: "Old", targetAmount: 10, currentAmount: 0, deadline: "" } });
    expect(legacy).toMatchObject({ mapping_status: "mapped", status: null, deadline: null, created_at: null, pinned: null });
  });

  it("SPENDLY-609: maps a goal event; a bad amount makes the row unmapped, never dropped", () => {
    const events = SPEC_BY_COLLECTION.get("goalEvents")!;
    const ok = mapDocument(events, "u1", {
      id: "ev1",
      updateTime: UPDATE_TIME,
      data: { goalId: "g1", type: "correction", amountDelta: -450, reason: "other", correctionOf: "c1", createdAtMs: 1_790_000_000_000, note: "typo" },
    });
    expect(ok).toMatchObject({ goal_id: "g1", type: "correction", amount_delta: -450, reason: "other", correction_of: "c1", mapping_status: "mapped" });
    expect(ok.doc).toMatchObject({ note: "typo" });
    const bad = mapDocument(events, "u1", { id: "ev2", updateTime: UPDATE_TIME, data: { goalId: "g1", type: "contribution", amountDelta: "lots" } });
    expect(bad).toMatchObject({ mapping_status: "unmapped", amount_delta: null, goal_id: null });
    expect(bad.doc).toMatchObject({ amountDelta: "lots" });
  });

  it("SPENDLY-685: maps a group fund; its totals stay in doc as an exact copy", () => {
    const funds = SPEC_BY_COLLECTION.get("groupFunds")!;
    const totals = { opening: 0, contributions: 6100, payouts: 0, transfersIn: 0, transfersOut: 0, held: 6100 };
    const row = mapDocument(funds, "u1", {
      id: "f1",
      updateTime: UPDATE_TIME,
      data: { name: "Dokra", status: "active", version: 3, createdAtMs: 1_790_000_000_000, totals, byPurpose: {}, heldByAccount: { hdfc: 6100 } },
    });
    expect(row).toMatchObject({
      source_path: "users/u1/groupFunds/f1", mapping_status: "mapped", name: "Dokra", status: "active", version: 3,
      created_at: new Date(1_790_000_000_000).toISOString(),
    });
    expect(row.doc).toMatchObject({ totals, heldByAccount: { hdfc: 6100 } });
    expect(row).not.toHaveProperty("held");
  });

  it("SPENDLY-685: maps a group fund event; a bad amount makes the row unmapped, never dropped", () => {
    const events = SPEC_BY_COLLECTION.get("groupFundEvents")!;
    const ok = mapDocument(events, "u1", {
      id: "rev_c1",
      updateTime: UPDATE_TIME,
      data: {
        fundId: "f1", kind: "reversal", amount: 6000, purposeId: "appu", memberId: "m1", date: "2026-11-05",
        period: "2026-11", reversalOf: "c1", reversedKind: "contribution", createdAtMs: 1_790_000_000_000,
      },
    });
    expect(ok).toMatchObject({
      fund_id: "f1", kind: "reversal", amount: 6000, purpose_id: "appu", member_id: "m1", date: "2026-11-05",
      period: "2026-11", reversal_of: "c1", created_at: new Date(1_790_000_000_000).toISOString(), mapping_status: "mapped",
    });
    expect(ok.doc).toMatchObject({ reversedKind: "contribution" });
    const bad = mapDocument(events, "u1", { id: "c2", updateTime: UPDATE_TIME, data: { fundId: "f1", kind: "contribution", amount: "lots" } });
    expect(bad).toMatchObject({ mapping_status: "unmapped", amount: null, fund_id: null });
    expect(bad.doc).toMatchObject({ amount: "lots" });
  });

  it("SPENDLY-709: maps a tax entry; amounts stay in doc, a soft delete is typed", () => {
    const entries = SPEC_BY_COLLECTION.get("taxEntries")!;
    const fields = { deductorName: "State Bank of India", tan: "MUMS98765C", section: "194A", form: "16A", amountPaid: 48250.4, tdsAmount: 4825.04 };
    const row = mapDocument(entries, "u1", {
      id: "e1",
      updateTime: UPDATE_TIME,
      data: {
        fy: "2025-26", kind: "tds", fields, dedupeKey: "k", revision: 2, schemaVersion: 1,
        deletedAt: "2026-01-02T03:04:05.000Z", createdAtMs: 1_790_000_000_000, updatedAtMs: 1_790_000_100_000,
      },
    });
    expect(row).toMatchObject({
      source_path: "users/u1/taxEntries/e1", mapping_status: "mapped", fy: "2025-26", kind: "tds",
      soft_deleted_at: "2026-01-02T03:04:05.000Z",
      created_at: new Date(1_790_000_000_000).toISOString(), updated_at: new Date(1_790_000_100_000).toISOString(),
    });
    expect(row.doc).toMatchObject({ fields });
    expect(row).not.toHaveProperty("amount");
  });

  it("SPENDLY-709: maps the other tax collections by year and identifiers only", () => {
    const at = { createdAtMs: 1_790_000_000_000, updatedAtMs: 1_790_000_000_000 };
    expect(
      mapDocument(SPEC_BY_COLLECTION.get("taxProfiles")!, "u1", {
        id: "2025-26", updateTime: UPDATE_TIME, data: { fy: "2025-26", residentialStatus: "resident", ageBand: "below_60", ...at },
      })
    ).toMatchObject({ fy: "2025-26", mapping_status: "mapped" });
    expect(
      mapDocument(SPEC_BY_COLLECTION.get("taxReviews")!, "u1", {
        id: "2025-26__income__i1", updateTime: UPDATE_TIME,
        data: { fy: "2025-26", sourceKind: "income", sourceId: "i1", decision: "exclude", sourceAmount: 1200, revision: 1, ...at },
      })
    ).toMatchObject({ fy: "2025-26", source_kind: "income", source_id: "i1", decision: "exclude" });
    expect(
      mapDocument(SPEC_BY_COLLECTION.get("taxDocuments")!, "u1", {
        id: "d1", updateTime: UPDATE_TIME,
        data: { fy: "2025-26", category: "form16", status: "pending", storagePath: "users/u1/tax/d1/f.pdf", ...at },
      })
    ).toMatchObject({ fy: "2025-26", category: "form16", status: "pending" });
    const snapshot = mapDocument(SPEC_BY_COLLECTION.get("taxSnapshots")!, "u1", {
      id: "2025-26__1790000000000", updateTime: UPDATE_TIME,
      data: { fy: "2025-26", law: "ITA1961", reason: "export", ruleVersion: "FY2025-26.v1", outputs: { taxNew: 12345 }, createdAtMs: at.createdAtMs },
    });
    expect(snapshot).toMatchObject({ fy: "2025-26", rule_version: "FY2025-26.v1", reason: "export" });
    expect(snapshot.doc).toMatchObject({ outputs: { taxNew: 12345 } });
  });

  it("SPENDLY-709: the tax collections are found by their millisecond stamps too", () => {
    for (const c of ["taxProfiles", "taxEntries", "taxReviews", "taxDocuments"]) {
      expect(changeFieldsOf({ collection: c }).map((f) => f.field)).toEqual(["createdAt", "updatedAt", "createdAtMs", "updatedAtMs"]);
    }
    expect(changeFieldsOf({ collection: "taxSnapshots" }).map((f) => f.field)).toEqual(["createdAt", "updatedAt", "createdAtMs"]);
  });

  it("derives month from the date when the row has none", () => {
    const row = mapDocument(expenses, "u1", { id: "e", updateTime: UPDATE_TIME, data: { amount: 1, date: "2026-08-15" } });
    expect(row.month).toBe("2026-08");
  });

  it("treats a restored row's empty deletedAt as not deleted", () => {
    const row = mapDocument(expenses, "u1", { id: "e", updateTime: UPDATE_TIME, data: { amount: 1, deletedAt: "" } });
    expect(row.soft_deleted_at).toBeNull();
    expect(row.mapping_status).toBe("mapped");
  });

  it.each([
    ["non-numeric amount", { amount: "abc" }],
    ["NaN amount", { amount: Number.NaN }],
    ["overflowing amount", { amount: 1e17 }],
    ["impossible date", { amount: 1, date: "2026-02-30" }],
    ["slash date", { amount: 1, date: "2026/02/03" }],
    ["number as category", { amount: 1, category: 5 }],
    ["garbage deletedAt", { amount: 1, deletedAt: "not a time" }],
  ])("marks a row unmapped, never dropped: %s", (_name, data) => {
    const row = mapDocument(expenses, "u1", { id: "bad", updateTime: UPDATE_TIME, data });
    expect(row.mapping_status).toBe("unmapped");
    expect(row.amount).toBeNull();
    expect(row.month).toBeNull();
    expect(row.doc).toEqual(toJsonDoc(data));
    expect(row.doc_id).toBe("bad");
  });

  it("accepts numeric strings and ISO datetimes", () => {
    const row = mapDocument(expenses, "u1", { id: "e", updateTime: UPDATE_TIME, data: { amount: "99.5", date: "2026-10-01T05:30:00.000Z" } });
    expect(row).toMatchObject({ amount: 99.5, date: "2026-10-01", mapping_status: "mapped" });
  });

  it("normalises every timestamp shape", () => {
    const ms = Date.UTC(2026, 9, 1, 12);
    expect(timestampMillis({ toMillis: () => ms })).toBe(ms);
    expect(timestampMillis({ seconds: ms / 1000, nanoseconds: 0 })).toBe(ms);
    expect(timestampMillis({ _seconds: ms / 1000, _nanoseconds: 0 })).toBe(ms);
    expect(timestampMillis(new Date(ms).toISOString())).toBe(ms);
    expect(timestampMillis(ms)).toBe(ms);
    expect(timestampMillis(new Date(ms))).toBe(ms);
    expect(timestampMillis("nope")).toBeNull();
  });

  it("maps booleans and integers strictly", () => {
    const categories = SPEC_BY_COLLECTION.get("categories")!;
    expect(mapDocument(categories, "u", { id: "c", updateTime: UPDATE_TIME, data: { name: "A", isHidden: true, sortOrder: 3 } }))
      .toMatchObject({ is_hidden: true, sort_order: 3, mapping_status: "mapped" });
    expect(mapDocument(categories, "u", { id: "c", updateTime: UPDATE_TIME, data: { name: "A", sortOrder: 1.5 } }).mapping_status)
      .toBe("unmapped");
    expect(mapDocument(categories, "u", { id: "c", updateTime: UPDATE_TIME, data: { name: "A", isHidden: "yes" } }).mapping_status)
      .toBe("unmapped");
  });

  it("refuses a document with no updateTime (the version guard needs one)", () => {
    expect(() => mapDocument(expenses, "u", { id: "e", updateTime: undefined, data: {} })).toThrow(/updateTime/);
  });

  it("produces JSON-safe docs", () => {
    expect(toJsonDoc({ a: Number.POSITIVE_INFINITY, b: [1, { c: new Date(0) }], d: undefined })).toEqual({
      a: null, b: [1, { c: "1970-01-01T00:00:00.000Z" }], d: null,
    });
  });
});

// SPENDLY-681: the changed-only sync must be able to find every collection's changes.

describe("change fields for the changed-only sync (SPENDLY-681)", () => {
  const STAMP = /^(createdAtMs|updatedAtMs|atMs|at|dismissedAt)$/;

  it("every stamp a collection maps is one of its change fields", () => {
    const missing: string[] = [];
    for (const spec of READ_MODEL_TABLES) {
      if (spec.root) continue;
      const fields = new Set(changeFieldsOf(spec).map((c) => c.field));
      for (const f of spec.fields) if (STAMP.test(f.source) && !fields.has(f.source)) missing.push(`${spec.collection}.${f.source}`);
    }
    expect(missing).toEqual([]);
  });

  it("extra change fields name synced collections; *Ms fields compare as numbers, the rest as Timestamps", () => {
    for (const [collection, fields] of Object.entries(EXTRA_CHANGE_FIELDS)) {
      expect(SPEC_BY_COLLECTION.has(collection)).toBe(true);
      for (const c of fields) expect(c.type).toBe(c.field.endsWith("Ms") ? "millis" : "timestamp");
    }
  });

  it("every collection keeps createdAt and updatedAt", () => {
    for (const spec of READ_MODEL_TABLES) {
      expect(changeFieldsOf(spec).slice(0, 2).map((c) => c.field)).toEqual(["createdAt", "updatedAt"]);
    }
  });
});
