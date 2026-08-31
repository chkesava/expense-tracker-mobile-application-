import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ganesh festival management source contract", () => {
  it("claims a year sentinel in the create transaction and blocks duplicate years", () => {
    const writes = read("services/ganesh/ganeshWrites.ts");
    const createStart = writes.indexOf("export async function createFestival");
    const createEnd = writes.indexOf("export async function updateFestivalTargets");
    const create = writes.slice(createStart, createEnd);
    expect(create).toContain("commitFestivalAndYearClaim");
    expect(create).toContain("yearTakenByAnotherFestival");
    expect(create).toContain("duplicateFestivalYearMessage");
    expect(writes).toContain("festivalYearDoc");
    expect(writes).toContain("seedFirstFestival");
    expect(writes.indexOf("commitFestivalAndYearClaim")).toBeGreaterThan(-1);
  });

  it("writes reopened audit on reopen and closed audit on close-with-transfer", () => {
    const writes = read("services/ganesh/ganeshWrites.ts");
    const reopen = writes.slice(writes.indexOf("export async function reopenFestival"));
    expect(reopen).toContain('"reopened"');
    expect(reopen).toContain("deleteField()");

    const pf = read("services/ganesh/ganeshPermanentFund.ts");
    const closeStart = pf.indexOf("if (input.closeFestival)");
    const closeBlock = pf.slice(closeStart, closeStart + 1200);
    expect(closeBlock).toContain('writeFestivalAudit');
    expect(closeBlock).toContain('"closed"');
    expect(closeBlock).toContain('"transferred"');
    expect(closeBlock).toContain('"festival"');
    expect(closeBlock).toContain('"fundTransfer"');
  });

  it("locks festivalYears create to festival.create and forbids update/delete", () => {
    const rules = read("firestore.rules");
    const start = rules.indexOf("match /festivalYears/{year}");
    expect(start).toBeGreaterThan(-1);
    const block = rules.slice(start, rules.indexOf("match /festivals/{festivalId}"));
    expect(block).toContain("canCreateFestival()");
    expect(block).toContain("request.resource.data.festivalId is string");
    expect(block).toContain("allow update, delete: if false");
    expect(block).toContain("isActivePandalMember()");
  });
});
