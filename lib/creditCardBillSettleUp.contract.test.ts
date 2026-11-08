import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-719 guard. The bills list and every reminder trust the stored bill
 * (`amountPaid`, `status`, `remainingAmount`); only the bill pass keeps it in
 * line with the ledger, where cashback also settles statements. So:
 *
 * - every money action that moves a card's settlement asks for a pass
 *   straight after (`requestBillPass`);
 * - the pass's "already done" fingerprint covers the stored settlement, so a
 *   skipped compare-and-set is retried instead of remembered as finished.
 *
 * A new writer of bill payments or cashback belongs in WRITERS below. These
 * files import React Native, so this pins their source.
 */
const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");
const provider = read("providers/CreditCardBillsProvider.tsx");

/** The body of `const <name> = useCallback(…)` up to its dependency list. */
function callbackBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  );\n", start);
  return source.slice(start, end);
}

const PROVIDER_ACTIONS = ["applyPaymentToBill", "recordBillPayment", "editBillPayment", "markBillPaid"];
const WRITERS = ["components/accounts/RecordCashbackModal.tsx", "components/creditCardBills/ReconcileStatementModal.tsx"];

describe("SPENDLY-719: stored bills are settled against the ledger after every money action", () => {
  it.each(PROVIDER_ACTIONS)("%s requests a bill pass", (name) => {
    expect(callbackBody(provider, name)).toContain("requestBillPass()");
  });

  it.each(WRITERS)("%s requests a bill pass after recording cashback", (file) => {
    const source = read(file);
    expect(source).toContain("addCashback(");
    expect(source).toContain("requestBillPass()");
  });

  it("every caller of addCashback is listed in WRITERS", () => {
    const root = path.resolve(__dirname, "..");
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && readFileSync(full, "utf8").includes("addCashback(")) {
          callers.push(path.relative(root, full).split(path.sep).join("/"));
        }
      }
    };
    for (const dir of ["app", "components"]) walk(path.join(root, dir));
    expect(callers.sort()).toEqual([...WRITERS].sort());
  });

  it("the pass fingerprint is built by billPassFingerprint (which covers the stored settlement)", () => {
    expect(provider).toContain("const fingerprint = billPassFingerprint({");
    expect(provider).not.toContain("const fingerprint = JSON.stringify(");
  });

  it("an unfinished pass is not remembered as done", () => {
    expect(provider).toContain('lastAutoBillFingerprintRef.current = incomplete ? "" : fingerprint;');
  });
});
