export function pandalDoc(pandalId: string): [string, string] {
  return ["pandals", pandalId];
}

export function pandalMembersCol(pandalId: string): [string, string, string] {
  return ["pandals", pandalId, "members"];
}

export function festivalsCol(pandalId: string): [string, string, string] {
  return ["pandals", pandalId, "festivals"];
}

export function festivalDoc(pandalId: string, festivalId: string): string[] {
  return ["pandals", pandalId, "festivals", festivalId];
}

export function festivalCol(
  pandalId: string,
  festivalId: string,
  name:
    | "members"
    | "openingFunds"
    | "households"
    | "collections"
    | "contributions"
    | "expenses"
    | "reimbursements"
    | "categories"
    | "activity"
    | "auditLogs"
    | "fundTransfers"
): string[] {
  return ["pandals", pandalId, "festivals", festivalId, name];
}

export function permanentFundDoc(pandalId: string): string[] {
  return ["pandals", pandalId, "permanentFund", "current"];
}

export function permanentFundTransactionsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "permanentFundTransactions"];
}

export function summaryDoc(pandalId: string, festivalId: string): string[] {
  return ["pandals", pandalId, "festivals", festivalId, "summary", "current"];
}

export function membershipDoc(uid: string, pandalId: string): string[] {
  return ["users", uid, "pandalMemberships", pandalId];
}
