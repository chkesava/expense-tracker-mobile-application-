import { describe, expect, it } from "vitest";

import type { PandalMember, PandalMemberAudit } from "@/shared/types/ganesh";
import { lastAdminSafetyMessage, memberAuditLine } from "@/shared/utils/ganeshMemberCopy";

const members: PandalMember[] = [
  { id: "a", userId: "a", displayName: "Anita", role: "admin", status: "active" },
  { id: "b", userId: "b", displayName: "Ravi", role: "member", status: "active" },
];

function audit(action: PandalMemberAudit["action"]): PandalMemberAudit {
  return { id: "1", actorId: "a", targetUserId: "b", action };
}

describe("lastAdminSafetyMessage", () => {
  it("uses the spec self-copy when the last admin is the current user", () => {
    expect(lastAdminSafetyMessage(true)).toBe(
      "You cannot remove or demote yourself until another Admin is assigned."
    );
  });

  it("keeps a third-person warning for another last admin", () => {
    expect(lastAdminSafetyMessage(false)).toContain("only Pandal Admin");
  });
});

describe("memberAuditLine", () => {
  it("labels create, reject, and join events", () => {
    expect(memberAuditLine(audit("pandal_created"), members)).toContain("created this Pandal");
    expect(memberAuditLine(audit("rejected"), members)).toContain("did not approve Ravi");
    expect(memberAuditLine(audit("joined"), members)).toContain("Ravi joined");
  });
});
