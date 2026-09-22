import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Spendly personal tree — users/{uid}/... must stay readable by its owner.
 *
 * The Ganesh membership work added a `document[0] != 'pandalMemberships'`
 * guard to the recursive owner grant; nothing covered the personal
 * collections it sits on top of.
 */

const PROJECT_ID = "spendly-personal-data";
const OWNER = "u-owner";
const OTHER = "u-other";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", OWNER), { email: "owner@example.com" });
    await setDoc(doc(db, "users", OWNER, "expenses", "e1"), {
      amount: 10,
      createdAt: 1,
    });
    await setDoc(doc(db, "users", OWNER, "accounts", "a1"), { name: "Cash" });
    await setDoc(doc(db, "users", OWNER, "accounts", "a1", "statements", "s1"), {
      month: "2026-09",
    });
  });
});

describe("personal tree", () => {
  const collections = [
    "expenses",
    "incomes",
    "accounts",
    "accountTypes",
    "accountEntries",
    "accountPayments",
    "accountNotes",
    "accountReconciliations",
    "accountTransfers",
    "categories",
    "subscriptions",
    "epfProfile",
    "epfEstablishments",
    "epfContributions",
    "epfContributionEvents",
    "epfTransfers",
    "epfTransferEvents",
    "epfInterestEntries",
    "epfReconciliations",
    "investmentCashTransactions",
    "holdings",
    "creditCardBills",
    "borrowings",
    "borrowingRepayments",
    "receivables",
    "receivableRepayments",
    "categoryBudgets",
    "financialGoals",
    "spaces",
    "portfolioSettings",
    "sipPlans",
  ];
  const moneyCollections = [
    "expenses",
    "incomes",
    "accountEntries",
    "accountPayments",
    "accountTransfers",
    "investmentCashTransactions",
    "borrowingRepayments",
    "receivableRepayments",
    "categoryBudgets",
    "subscriptions",
  ];
  const validatedWithoutAmount = [
    "accountNotes",
    "accountReconciliations",
    "epfEstablishments",
    "epfContributions",
    "holdings",
    "creditCardBills",
    "borrowings",
    "receivables",
    "financialGoals",
    "portfolioSettings",
    "sipPlans",
  ];
  const schemalessCollections = collections.filter(
    (name) =>
      !moneyCollections.includes(name) && !validatedWithoutAmount.includes(name)
  );

  it("owner reads their own user doc", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, "users", OWNER)));
  });

  it("owner can merge a non-role field onto their user doc", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", OWNER), { username: "owner", currency: "USD" }, { merge: true })
    );
  });

  it("owner cannot merge SUPER_ADMIN onto their user doc", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER), { role: "SUPER_ADMIN" }, { merge: true })
    );
  });

  it("owner can create a user doc without role", async () => {
    const db = env.authenticatedContext("u-new").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", "u-new"), { email: "new@example.com" })
    );
  });

  it("owner can create a user doc with role USER", async () => {
    const db = env.authenticatedContext("u-user").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", "u-user"), { role: "USER" })
    );
  });

  it("owner cannot create a user doc as SUPER_ADMIN", async () => {
    const db = env.authenticatedContext("u-admin").firestore();
    await assertFails(
      setDoc(doc(db, "users", "u-admin"), { role: "SUPER_ADMIN" })
    );
  });

  it("a stranger cannot read the owner's user doc", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(db, "users", OWNER)));
  });

  it("a stranger cannot write the owner's user doc", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER), { username: "hijack" }, { merge: true })
    );
  });

  for (const name of collections) {
    it(`owner lists ${name}`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertSucceeds(getDocs(collection(db, "users", OWNER, name)));
    });

    it(`a stranger cannot list the owner's ${name}`, async () => {
      const db = env.authenticatedContext(OTHER).firestore();
      await assertFails(getDocs(collection(db, "users", OWNER, name)));
    });
  }

  for (const name of schemalessCollections) {
    it(`owner writes ${name}`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertSucceeds(
        addDoc(collection(db, "users", OWNER, name), { v: 1 })
      );
    });
  }

  for (const name of moneyCollections) {
    it(`owner writes a well-formed ${name} row`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertSucceeds(
        addDoc(collection(db, "users", OWNER, name), {
          amount: 10,
          date: "2026-09-17",
        })
      );
    });

    it(`owner cannot write a negative ${name} amount`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertFails(
        addDoc(collection(db, "users", OWNER, name), {
          amount: -1e12,
          date: "2026-09-17",
        })
      );
    });

    it(`owner cannot write a ${name} row with a non-date`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertFails(
        addDoc(collection(db, "users", OWNER, name), {
          amount: 10,
          date: "not-a-date",
        })
      );
    });
  }

  it("owner writes a well-formed account reconciliation", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "accountReconciliations"), {
        accountId: "a1",
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        statementClosingBalance: 4500,
        ledgerClosingBalance: 4500,
        variance: 0,
        status: "balanced",
      })
    );
  });

  it("owner can reconcile an overdrawn account to a negative balance", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "accountReconciliations"), {
        accountId: "a1",
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        statementClosingBalance: -1200,
        ledgerClosingBalance: -900,
        variance: -300,
        status: "variance",
      })
    );
  });

  it("owner cannot write a reconciliation with no account", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "accountReconciliations"), {
        accountId: "",
        variance: 0,
        status: "balanced",
      })
    );
  });

  it("owner cannot invent a third reconciliation status", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "accountReconciliations"), {
        accountId: "a1",
        variance: 0,
        status: "approved",
      })
    );
  });

  it("owner cannot write a reconciliation with a non-date period", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "accountReconciliations"), {
        accountId: "a1",
        fromDate: "not-a-date",
        variance: 0,
        status: "balanced",
      })
    );
  });

  it("owner can patch an existing expense without sending amount", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "users", OWNER, "expenses", "e1"),
        { tripId: "trip-1" },
        { merge: true }
      )
    );
  });

  it("owner writes a well-formed holding", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "holdings"), {
        quantity: 10,
        averageBuyPrice: 100,
        datePurchased: "2026-09-17",
      })
    );
  });

  it("owner cannot write a negative holding quantity", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "holdings"), {
        quantity: -1,
        averageBuyPrice: 100,
      })
    );
  });

  it("owner writes portfolio settings with a non-negative cashBalance", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", OWNER, "portfolioSettings", "main"), {
        cashBalance: 5000,
        initialInvestmentAmount: 5000,
      })
    );
  });

  it("owner cannot write a negative cashBalance", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "portfolioSettings", "main"), {
        cashBalance: -1,
      })
    );
  });

  it("owner can increment cashBalance without going negative", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const ref = doc(db, "users", OWNER, "portfolioSettings", "config");
    await assertSucceeds(setDoc(ref, { cashBalance: 5000, initialInvestmentAmount: 5000 }));
    await assertSucceeds(
      setDoc(ref, { cashBalance: increment(-310) }, { merge: true })
    );
  });

  it("owner cannot increment cashBalance below zero", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const ref = doc(db, "users", OWNER, "portfolioSettings", "config");
    await assertSucceeds(setDoc(ref, { cashBalance: 50 }));
    await assertFails(setDoc(ref, { cashBalance: increment(-100) }, { merge: true }));
  });

  it("owner writes a well-formed credit-card bill", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "creditCardBills"), {
        statementAmount: 12000,
        amountPaid: 0,
        remainingAmount: 12000,
        dueDate: "2026-10-05",
        statementDate: "2026-09-20",
      })
    );
  });

  it("owner writes a well-formed receivable", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "receivables"), {
        originalAmount: 5000,
        outstandingAmount: 5000,
        totalReceived: 0,
        lentDate: "2026-09-17",
      })
    );
  });

  it("owner cannot write a negative receivable originalAmount", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "receivables"), {
        originalAmount: -1,
        lentDate: "2026-09-17",
      })
    );
  });

  it("owner writes a well-formed financial goal", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "financialGoals"), {
        targetAmount: 100000,
        currentAmount: 0,
      })
    );
  });

  it("owner cannot write a negative financial-goal target", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "financialGoals"), {
        targetAmount: -1,
        currentAmount: 0,
      })
    );
  });

  it("owner cannot write a negative amountPaid on a bill", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "creditCardBills"), {
        statementAmount: 12000,
        amountPaid: -1,
        remainingAmount: 12000,
        dueDate: "2026-10-05",
      })
    );
  });

  it("owner writes a well-formed EPF contribution", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", OWNER, "epfContributions", "est-1_2026-09"), {
        establishmentId: "est-1",
        month: "2026-09",
        wage: 15000,
        employeeShare: 1800,
        employerShare: 1800,
        epsShare: 1250,
        epfCredit: 2350,
        status: "expected",
        source: "simulated",
      })
    );
  });

  it("owner cannot write an unknown EPF contribution status", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "epfContributions", "est-1_2026-08"), {
        month: "2026-08",
        wage: 15000,
        status: "bogus",
        source: "simulated",
      })
    );
  });

  it("owner writes a well-formed EPF establishment", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      addDoc(collection(db, "users", OWNER, "epfEstablishments"), {
        dateJoined: "2020-01-15",
        wage: 25000,
        employmentStatus: "current",
      })
    );
  });

  it("owner cannot mint an unknown personal collection", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "zzzAnything", "x"), { blob: "nope" })
    );
  });

  it("owner reads an ordered expenses query", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "users", OWNER, "expenses"),
          orderBy("createdAt", "desc")
        )
      )
    );
  });

  it("owner reads a nested sub-subcollection", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", OWNER, "accounts", "a1", "statements"))
    );
  });

  it("owner reads their duress tree", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", `${OWNER}_duress`, "expenses"))
    );
  });

  it("a stranger cannot read the owner's expenses", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "expenses")));
  });

  // KAN-65 — a UAN and PF member IDs are strong identity artifacts, so the
  // ownership boundary is asserted explicitly rather than only by the loop.
  it("a stranger cannot list the owner's EPF establishments", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      getDocs(collection(db, "users", OWNER, "epfEstablishments"))
    );
  });

  it("a stranger cannot list the owner's EPF contributions", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "epfContributions")));
  });

  it("a stranger cannot write an EPF contribution into the owner's tree", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "epfContributions", "est-1_2021-06"), {
        establishmentId: "est-1",
        month: "2021-06",
      })
    );
  });

  it("a stranger cannot read the owner's EPF profile", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(db, "users", OWNER, "epfProfile", "main")));
  });

  it("a stranger cannot write the owner's EPF profile", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "epfProfile", "main"), {
        uan: "100123456789",
      })
    );
  });

  it("owner reads their duress EPF tree", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", `${OWNER}_duress`, "epfEstablishments"))
    );
  });

  it("owner lists their own membership index", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", OWNER, "pandalMemberships"))
    );
  });

  // KAN-123 -- cashback records are credits against a credit card and live in
  // accountPayments, so they ride the same owner grant. The boundary is
  // asserted explicitly because these rows move a real liability.
  describe("cashback records", () => {
    const cashback = {
      fromAccountId: "cashback",
      toAccountId: "a1",
      amount: 299,
      date: "2026-09-08",
      sourceType: "cashback",
      cashbackKind: "statement_credit",
    };

    it("owner writes a cashback record", async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertSucceeds(
        setDoc(doc(db, "users", OWNER, "accountPayments", "cashback_abc"), cashback)
      );
    });

    it("owner reverses their own cashback rather than deleting it", async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      const ref = doc(db, "users", OWNER, "accountPayments", "cashback_abc");
      await assertSucceeds(setDoc(ref, cashback));
      await assertSucceeds(
        setDoc(ref, { ...cashback, voidedAt: "2026-09-09T00:00:00.000Z" })
      );
    });

    it("a stranger cannot create a cashback on the owner's card", async () => {
      const db = env.authenticatedContext(OTHER).firestore();
      await assertFails(
        setDoc(doc(db, "users", OWNER, "accountPayments", "cashback_xyz"), cashback)
      );
    });

    it("a stranger cannot read the owner's cashback records", async () => {
      const db = env.authenticatedContext(OTHER).firestore();
      await assertFails(
        getDocs(collection(db, "users", OWNER, "accountPayments"))
      );
    });

    it("an unauthenticated client cannot write a cashback record", async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(
        setDoc(doc(db, "users", OWNER, "accountPayments", "cashback_anon"), cashback)
      );
    });
  });

  // SPENDLY-38 — journal audit events are owner-only and append-only.
  describe("ledgerEvents", () => {
    const event = {
      kind: "expense",
      docId: "e1",
      action: "update",
      before: { amount: 10, date: "2026-09-01", month: "2026-09" },
      after: { amount: 8, date: "2026-09-01", month: "2026-09" },
      actorUid: OWNER,
    };

    it("owner creates and reads a ledger event", async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      const ref = doc(db, "users", OWNER, "ledgerEvents", "ev1");
      await assertSucceeds(setDoc(ref, event));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(
        getDocs(
          query(
            collection(db, "users", OWNER, "ledgerEvents"),
            orderBy("createdAt", "desc")
          )
        )
      );
    });

    it("owner cannot update or delete a ledger event", async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      const ref = doc(db, "users", OWNER, "ledgerEvents", "ev1");
      await assertSucceeds(setDoc(ref, event));
      await assertFails(updateDoc(ref, { reason: "rewrite" }));
      await assertFails(deleteDoc(ref));
    });

    it("a stranger cannot create or read the owner's ledger events", async () => {
      const db = env.authenticatedContext(OTHER).firestore();
      await assertFails(
        setDoc(doc(db, "users", OWNER, "ledgerEvents", "ev-x"), event)
      );
      await assertFails(
        getDocs(collection(db, "users", OWNER, "ledgerEvents"))
      );
    });
  });

  it("owner can soft-delete an expense without sending a new amount", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "users", OWNER, "expenses", "e1"),
        { deletedAt: "2026-09-17T00:00:00.000Z", deletedBy: OWNER },
        { merge: true }
      )
    );
  });

  // The recursive owner grant must still not become a write primitive on the
  // membership index -- that exclusion is the whole reason the guard exists.
  it("owner cannot forge a membership index entry", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "pandalMemberships", "pandal-x"), {
        pandalId: "pandal-x",
        role: "admin",
        status: "active",
      })
    );
  });
});

/**
 * Account notes (SPENDLY-89).
 *
 * The rule carries one guarantee the client cannot be trusted to keep on its
 * own: a note is context, never money. So the cases that matter most here are
 * the rejections -- a note with an amount on it, and a note being moved to an
 * account it was not written against.
 */
describe("account notes", () => {
  const notes = (uid: string) =>
    collection(env.authenticatedContext(uid).firestore(), "users", uid, "accountNotes");

  it("owner writes a well-formed note", async () => {
    await assertSucceeds(
      addDoc(notes(OWNER), {
        accountId: "a1",
        title: "Branch",
        body: "Indiranagar, opened 2019",
        pinned: false,
        createdAtMs: 1_700_000_000_000,
        updatedAtMs: 1_700_000_000_000,
      })
    );
  });

  it("owner writes a note with a body and no title", async () => {
    await assertSucceeds(
      addDoc(notes(OWNER), { accountId: "a1", title: "", body: "Kept open for the locker", pinned: true })
    );
  });

  it("owner cannot write a note that is entirely empty", async () => {
    await assertFails(
      addDoc(notes(OWNER), { accountId: "a1", title: "", body: "", pinned: false })
    );
  });

  it("owner cannot write a note without an account", async () => {
    await assertFails(
      addDoc(notes(OWNER), { accountId: "", title: "Orphan", body: "", pinned: false })
    );
  });

  // The point of the collection: no note may carry a figure, so no balance,
  // statement or analytic can ever be derived from one.
  it("owner cannot put an amount on a note", async () => {
    await assertFails(
      addDoc(notes(OWNER), {
        accountId: "a1",
        title: "Sneaky",
        body: "",
        pinned: false,
        amount: 5000,
      })
    );
  });

  it("owner cannot put a date key on a note", async () => {
    await assertFails(
      addDoc(notes(OWNER), {
        accountId: "a1",
        title: "Sneaky",
        body: "",
        pinned: false,
        date: "2026-09-17",
      })
    );
  });

  it("owner cannot exceed the title limit", async () => {
    await assertFails(
      addDoc(notes(OWNER), {
        accountId: "a1",
        title: "t".repeat(81),
        body: "",
        pinned: false,
      })
    );
  });

  it("owner cannot exceed the body limit", async () => {
    await assertFails(
      addDoc(notes(OWNER), {
        accountId: "a1",
        title: "",
        body: "b".repeat(2001),
        pinned: false,
      })
    );
  });

  it("owner cannot write a non-boolean pinned flag", async () => {
    await assertFails(
      addDoc(notes(OWNER), {
        accountId: "a1",
        title: "Branch",
        body: "",
        pinned: "yes",
      })
    );
  });

  it("owner edits their own note", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", OWNER, "accountNotes", "n1"), {
        accountId: "a1",
        title: "Branch",
        body: "Indiranagar",
        pinned: false,
      });
    });
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", OWNER, "accountNotes", "n1"), {
        body: "Koramangala",
        pinned: true,
        updatedAtMs: 1_700_000_000_001,
      })
    );
  });

  // Account scoping has to be a property of the document, not of whoever wrote
  // to it last -- otherwise a note could be reparented onto another account
  // after the fact and show up under a name it was never written against.
  it("owner cannot move a note to another account", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", OWNER, "accountNotes", "n2"), {
        accountId: "a1",
        title: "Branch",
        body: "Indiranagar",
        pinned: false,
      });
    });
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      updateDoc(doc(db, "users", OWNER, "accountNotes", "n2"), {
        accountId: "a2",
      })
    );
  });

  it("owner deletes their own note", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", OWNER, "accountNotes", "n3"), {
        accountId: "a1",
        title: "Branch",
        body: "",
        pinned: false,
      });
    });
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      deleteDoc(doc(db, "users", OWNER, "accountNotes", "n3"))
    );
  });

  it("a stranger cannot write a note into the owner's tree", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "accountNotes"), {
        accountId: "a1",
        title: "Hijack",
        body: "",
        pinned: false,
      })
    );
  });

  it("a stranger cannot read the owner's notes", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", OWNER, "accountNotes", "n4"), {
        accountId: "a1",
        title: "Private",
        body: "",
        pinned: false,
      });
    });
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(db, "users", OWNER, "accountNotes", "n4")));
  });
});
