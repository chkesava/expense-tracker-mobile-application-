import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "@/shared/types/expense";
import {
  LEDGER_AUDIT_CHECKS,
  buildLedgerAuditContext,
  runLedgerAudit,
  type LedgerAuditInput,
  type LedgerAuditReadiness,
} from "./ledgerAudit";

const READY: LedgerAuditReadiness = {
  expensesComplete: true,
  incomesComplete: true,
  accountsLoaded: true,
  billsLoaded: true,
  subscriptionsLoaded: true,
  spacesLoaded: true,
  tripsLoaded: true,
  splitsLoaded: true,
  fromCache: false,
};

let nextId = 0;

function expense(over: Partial<Expense> = {}): Expense {
  nextId += 1;
  return {
    id: `exp-${nextId}`,
    amount: 250,
    category: "Food",
    note: "Lunch",
    date: "2026-09-10",
    month: "2026-09",
    createdAt: 1,
    ...over,
  };
}

function income(over: Partial<Income> = {}): Income {
  nextId += 1;
  return {
    id: `inc-${nextId}`,
    amount: 5000,
    source: "Salary",
    note: "September",
    date: "2026-09-01",
    month: "2026-09",
    createdAt: 1,
    ...over,
  };
}

function account(over: Partial<Account> = {}): Account {
  return { id: "acc-1", name: "HDFC", typeId: "type-bank", ...over };
}

function build(over: Partial<LedgerAuditInput> = {}): LedgerAuditInput {
  return {
    expenses: [],
    incomes: [],
    accounts: [account()],
    bills: [],
    subscriptions: [],
    spaces: [],
    trips: [],
    splits: [],
    readiness: READY,
    ...over,
  };
}

/** A ledger with a real, unambiguous problem in it. */
function dirtyLedger(): Partial<LedgerAuditInput> {
  return {
    expenses: [
      expense({ id: "a", smsFingerprint: "fp-1" }),
      expense({ id: "b", smsFingerprint: "fp-1" }),
    ],
  };
}

describe("ledger audit report (SPENDLY-112)", () => {
  describe("the truncation gate", () => {
    it("is unavailable while expenses are still the staged page", () => {
      const report = runLedgerAudit(
        build({ readiness: { ...READY, expensesComplete: false } })
      );
      expect(report.status).toBe("unavailable");
      expect(report.unavailableReason).toBe("expenses_incomplete");
    });

    it("is unavailable while incomes are truncated, even though expenses are complete", () => {
      const report = runLedgerAudit(
        build({ readiness: { ...READY, incomesComplete: false } })
      );
      expect(report.status).toBe("unavailable");
      expect(report.unavailableReason).toBe("incomes_incomplete");
    });

    it("is unavailable until accounts have loaded", () => {
      const report = runLedgerAudit(
        build({ readiness: { ...READY, accountsLoaded: false } })
      );
      expect(report.status).toBe("unavailable");
      expect(report.unavailableReason).toBe("accounts_not_loaded");
    });

    it("reports an incomplete ledger as unavailable, never as healthy", () => {
      // The trap. A truncated ledger produces no findings — and saying
      // "healthy" on that basis would be a lie, because nothing was checked.
      const report = runLedgerAudit(
        build({
          ...dirtyLedger(),
          readiness: { ...READY, expensesComplete: false },
        })
      );
      expect(report.findings).toEqual([]);
      expect(report.checks).toEqual([]);
      expect(report.status).not.toBe("healthy");
      expect(report.status).toBe("unavailable");
    });

    it("finds the same problem once the ledger is complete", () => {
      const report = runLedgerAudit(build(dirtyLedger()));
      expect(report.status).toBe("issues");
      expect(report.counts.error).toBe(1);
    });

    it("goes back to unavailable when a resubscribe resets expensesComplete", () => {
      const input = build(dirtyLedger());
      expect(runLedgerAudit(input).status).toBe("issues");
      const afterResubscribe = runLedgerAudit({
        ...input,
        readiness: { ...READY, expensesComplete: false },
      });
      expect(afterResubscribe.status).toBe("unavailable");
    });

    it("carries the cache flag into an unavailable report so the screen can explain itself", () => {
      const report = runLedgerAudit(
        build({ readiness: { ...READY, expensesComplete: false, fromCache: true } })
      );
      expect(report.coverage.fromCache).toBe(true);
    });
  });

  describe("offline data", () => {
    it("skips the orphan checks when the data came from cache", () => {
      // A cold cache can be missing an account document that exists on the
      // server. Concluding "orphaned" from that would manufacture findings
      // against a perfectly healthy ledger.
      const report = runLedgerAudit(
        build({
          expenses: [expense({ accountId: "gone" })],
          readiness: { ...READY, fromCache: true },
        })
      );
      const orphan = report.checks.find((check) => check.id === "orphan_account_ref");
      expect(orphan?.status).toBe("skipped");
      expect(orphan?.skippedReason).toBe("offline_cache");
      expect(report.findings).toEqual([]);
    });

    it("still runs the row-level checks offline", () => {
      const report = runLedgerAudit(
        build({
          expenses: [expense({ date: "2026-12-31", month: "2027-01" })],
          readiness: { ...READY, fromCache: true },
        })
      );
      const mismatch = report.checks.find((check) => check.id === "month_date_mismatch");
      expect(mismatch?.status).toBe("issues");
      expect(report.counts.warning).toBe(1);
    });
  });

  describe("the registry", () => {
    it("reports every check, clean ones included, so healthy is evidence", () => {
      const report = runLedgerAudit(build());
      expect(report.checks).toHaveLength(LEDGER_AUDIT_CHECKS.length);
      expect(report.checks.every((check) => check.status === "clean")).toBe(true);
      expect(report.status).toBe("healthy");
    });

    it("skips a check whose dataset was never loaded rather than calling it clean", () => {
      const report = runLedgerAudit(
        build({ readiness: { ...READY, tripsLoaded: false, splitsLoaded: false } })
      );
      const trip = report.checks.find((check) => check.id === "orphan_trip_ref");
      expect(trip?.status).toBe("skipped");
      expect(trip?.skippedReason).toBe("dataset_not_loaded");
      expect(report.counts.skippedChecks).toBe(2);
    });

    it("still reports healthy when an optional dataset is absent, and says what it covered", () => {
      const report = runLedgerAudit(
        build({ readiness: { ...READY, billsLoaded: false } })
      );
      expect(report.status).toBe("healthy");
      expect(report.coverage.datasets).not.toContain("bills");
      expect(report.coverage.datasets).toContain("expenses");
    });

    it("gives every check a distinct id and a human label", () => {
      const ids = LEDGER_AUDIT_CHECKS.map((check) => check.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(LEDGER_AUDIT_CHECKS.every((check) => check.label.trim().length > 0)).toBe(
        true
      );
    });

    it("declares its own datasets on every check", () => {
      expect(
        LEDGER_AUDIT_CHECKS.every((check) => check.requires.length > 0)
      ).toBe(true);
    });
  });

  describe("assembling the report", () => {
    it("orders errors before warnings", () => {
      const report = runLedgerAudit(
        build({
          expenses: [
            expense({ date: "2026-12-31", month: "2027-01" }),
            expense({ amount: -5 }),
          ],
        })
      );
      expect(report.findings.map((found) => found.severity)).toEqual([
        "error",
        "warning",
      ]);
    });

    it("partitions findings into errors and warnings exactly", () => {
      const report = runLedgerAudit(
        build({
          expenses: [
            expense({ amount: -5 }),
            expense({ amount: 0 }),
            expense({ date: "2026-12-31", month: "2027-01" }),
          ],
        })
      );
      expect(report.errors.length + report.warnings.length).toBe(
        report.findings.length
      );
      expect(report.counts.error).toBe(report.errors.length);
      expect(report.counts.warning).toBe(report.warnings.length);
    });

    it("counts only active rows as scanned", () => {
      const report = runLedgerAudit(
        build({
          expenses: [expense(), expense({ deletedAt: "2026-09-12T00:00:00Z" })],
          incomes: [income()],
        })
      );
      expect(report.coverage.expensesScanned).toBe(1);
      expect(report.coverage.incomesScanned).toBe(1);
    });

    it("keeps every finding reachable from its own check as well as the flat list", () => {
      const report = runLedgerAudit(build(dirtyLedger()));
      const fromChecks = report.checks.flatMap((check) => check.findings);
      expect(fromChecks).toHaveLength(report.findings.length);
    });

    it("names the affected records on every finding that has any", () => {
      const report = runLedgerAudit(
        build({ expenses: [expense({ amount: -1 }), expense({ amount: 0 })] })
      );
      for (const found of report.findings) {
        expect(found.subjects.length).toBeGreaterThan(0);
        for (const subject of found.subjects) {
          expect(subject.id).not.toBe("");
          expect(subject.label).not.toBe("");
        }
      }
    });
  });

  describe("the index", () => {
    it("drops soft-deleted rows before any check sees them", () => {
      const ctx = buildLedgerAuditContext(
        build({
          expenses: [expense(), expense({ deletedAt: "2026-09-12T00:00:00Z" })],
        })
      );
      expect(ctx.activeExpenses).toHaveLength(1);
    });

    it("groups fingerprints once for every check that needs them", () => {
      const ctx = buildLedgerAuditContext(
        build({
          expenses: [
            expense({ smsFingerprint: "fp-1" }),
            expense({ smsFingerprint: "fp-1" }),
            expense({ statementImportFingerprint: "stmt-1" }),
          ],
        })
      );
      expect(ctx.smsFingerprintGroups.get("fp:fp-1")).toHaveLength(2);
      expect(ctx.statementFingerprintGroups.get("stmt-1")).toHaveLength(1);
    });
  });

  describe("read-only", () => {
    const sourceOf = (file: string): string =>
      readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

    const MODULES = ["./ledgerAudit.ts", "./ledgerAuditChecks.ts"];

    it("imports nothing that can reach the database", () => {
      for (const file of MODULES) {
        const imports = sourceOf(file)
          .split("\n")
          .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+"/.test(line));
        expect(imports.length).toBeGreaterThan(0);
        for (const line of imports) {
          expect(line).not.toMatch(/firebase|firestore|@\/services\//i);
        }
      }
    });

    it("calls no write primitive", () => {
      const writeCall =
        /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction|commitWrite|commitMutations)\s*\(/;
      for (const file of MODULES) {
        expect(sourceOf(file)).not.toMatch(writeCall);
      }
    });

    it("offers no finding the UI could bind a mutating action to", () => {
      const report = runLedgerAudit(build(dirtyLedger()));
      for (const found of report.findings) {
        expect(found).not.toHaveProperty("fix");
        expect(found).not.toHaveProperty("autoFixable");
      }
    });

    it("does not mutate its inputs", () => {
      // Strict-mode ESM throws on a write to a frozen object, so a stray
      // in-place sort or a decorated row fails here rather than in production.
      const deepFreeze = <T>(rows: readonly T[]): readonly T[] => {
        rows.forEach((row) => Object.freeze(row));
        return Object.freeze(rows);
      };

      const input: LedgerAuditInput = {
        expenses: deepFreeze([
          expense({ id: "a", smsFingerprint: "fp-1" }),
          expense({ id: "b", smsFingerprint: "fp-1" }),
          expense({ amount: -1, accountId: "gone" }),
        ]),
        incomes: deepFreeze([income({ date: "2026-12-31", month: "2027-01" })]),
        accounts: deepFreeze([account()]),
        bills: deepFreeze([]),
        subscriptions: deepFreeze([]),
        spaces: deepFreeze([]),
        trips: deepFreeze([]),
        splits: deepFreeze([]),
        readiness: Object.freeze({ ...READY }),
      };

      expect(() => runLedgerAudit(input)).not.toThrow();
      expect(runLedgerAudit(input).status).toBe("issues");
    });
  });
});
