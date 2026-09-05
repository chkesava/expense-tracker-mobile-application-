import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ganesh membership foundation source contract", () => {
  it("namespaces session storage by uid and clears it when membership is gone", () => {
    const session = read("providers/GaneshSessionProvider.tsx");
    const tabs = read("app/(ganesh)/(tabs)/_layout.tsx");
    const gate = read("components/ganesh/GaneshMembershipGate.tsx");
    const data = read("providers/GaneshDataProvider.tsx");
    expect(session).toContain("ganeshSessionStorageKey(uid)");
    expect(session).toContain("GANESH_SESSION_LEGACY_KEY");
    expect(tabs).toContain("clearSession");
    expect(tabs).toContain("hasActivePandal");
    expect(tabs).toContain("sessionMembershipActive");
    expect(gate).toContain("sessionMembershipActive");
    expect(data).toContain("sessionMembershipActive");
    expect(data).toContain("festivalReady = Boolean(pandalId && festivalId && sessionMembershipActive)");
  });

  it("seeds festival members after open join without claiming memberIds or memberAudits", () => {
    const writes = read("services/ganesh/ganeshWrites.ts");
    const start = writes.indexOf('if (joinMode === "open" && !existing)');
    const end = writes.indexOf("export async function decideJoinRequest");
    const openJoin = writes.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(openJoin).toContain("seedOpenFestivalMemberRows");
    expect(openJoin).not.toContain("arrayUnion");
    expect(openJoin).not.toContain("memberAudit");
    expect(writes).toContain('action: "pandal_created"');
    expect(writes).toContain('action: "rejected"');
  });
});
