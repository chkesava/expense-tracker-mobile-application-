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

  it("refuses year changes in updateFestivalDetails and omits year from the write", () => {
    const writes = read("services/ganesh/ganeshWrites.ts");
    const start = writes.indexOf("export async function updateFestivalDetails");
    const end = writes.indexOf("export async function updatePandalMember");
    const update = writes.slice(start, end);
    expect(update).toContain("assertFestivalYearUnchanged");
    expect(update).toContain("Reopen the festival before changing its name or dates.");
    const payload = update.slice(update.indexOf("batch.update"), update.indexOf("audit("));
    expect(payload).not.toMatch(/\byear\b/);
  });

  it("constrains festival document updates to metadata, close, and reopen shapes", () => {
    const rules = read("firestore.rules");
    const start = rules.indexOf("match /festivals/{festivalId}");
    const block = rules.slice(start, rules.indexOf("match /fundTransfers/{docId}"));
    expect(block).toContain("festivalMetadataUpdate()");
    expect(block).toContain("festivalCloseUpdate()");
    expect(block).toContain("festivalReopenUpdate()");
    expect(block).toContain("festivalYearUnchanged()");
    expect(block).toContain("request.resource.data.closedBy == request.auth.uid");
  });
});

describe("KAN-36 summary path source contract", () => {
  it("writes and reads summary/totals, and repair merges current onto it", () => {
    const paths = read("shared/utils/ganeshPaths.ts");
    const summaryFn = paths.slice(paths.indexOf("export function summaryDoc"));
    expect(summaryFn).toContain('"totals"');
    expect(summaryFn.slice(0, summaryFn.indexOf("export function legacySummaryDoc"))).not.toContain(
      '"current"'
    );

    const writes = read("services/ganesh/ganeshWrites.ts");
    expect(writes).toContain("migrateSummaryAllocators");
    expect(writes).toContain("legacySummaryDoc");
    expect(writes).toContain("planSummaryAllocatorMerge");

    const prefetch = read("services/ganesh/ganeshStartupPrefetch.ts");
    expect(prefetch).toContain("summaryDoc");
    expect(prefetch).not.toContain('"current"');

    const functions = read("functions/src/summary.ts");
    expect(functions).toContain("summary/totals");
    expect(functions).not.toContain("summary/current");

    const netlify = read("netlify/functions/ganesh-summary.ts");
    expect(netlify).toContain("rebuildFestivalSummary");
    expect(netlify).toContain("seedFestivalSummary");
    expect(read("hooks/useGaneshWrites.ts")).toContain("requestFestivalSummaryRebuild");
    const bundle = read("scripts/bundle-ganesh-summary-fn.js");
    expect(bundle).toContain("overrides");
    expect(bundle).toContain("jose");
    expect(bundle).toContain("4.15.9");
    expect(read("providers/GaneshDataProvider.tsx")).toContain("festivalSummaryNeedsRebuild");
    expect(read("providers/GaneshDataProvider.tsx")).toContain("requestFestivalSummaryRebuild");
  });
});
