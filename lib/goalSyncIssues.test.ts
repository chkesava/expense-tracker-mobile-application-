import { beforeEach, describe, expect, it, vi } from "vitest";

import { goalSyncIssues } from "./goalSyncIssues";

const issue = (id: string, retry?: () => Promise<boolean>) => ({ id, goalId: "g1", label: "goal contribution", message: "m", atMs: 1, retry });

beforeEach(() => goalSyncIssues.clear());

describe("goalSyncIssues (SPENDLY-613)", () => {
  it("keeps a failed change until it is retried successfully or dismissed", async () => {
    const listener = vi.fn();
    const unsubscribe = goalSyncIssues.subscribe(listener);
    const retry = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    goalSyncIssues.add(issue("ev1", retry));
    expect(goalSyncIssues.list()).toHaveLength(1);
    expect(await goalSyncIssues.retry("ev1")).toBe(false);
    expect(goalSyncIssues.list()).toHaveLength(1);
    expect(await goalSyncIssues.retry("ev1")).toBe(true);
    expect(goalSyncIssues.list()).toHaveLength(0);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("one entry per submit: a repeated failure replaces, never duplicates", () => {
    goalSyncIssues.add(issue("ev1"));
    goalSyncIssues.add({ ...issue("ev1"), message: "newer" });
    expect(goalSyncIssues.list()).toEqual([expect.objectContaining({ id: "ev1", message: "newer" })]);
  });

  it("dismiss removes only that entry, and is a no-op for unknown ids", () => {
    goalSyncIssues.add(issue("a"));
    goalSyncIssues.add(issue("b"));
    const before = goalSyncIssues.list();
    goalSyncIssues.dismiss("zzz");
    expect(goalSyncIssues.list()).toBe(before);
    goalSyncIssues.dismiss("a");
    expect(goalSyncIssues.list().map((i) => i.id)).toEqual(["b"]);
  });

  it("retry without a retry function does nothing", async () => {
    goalSyncIssues.add(issue("x"));
    expect(await goalSyncIssues.retry("x")).toBe(false);
    expect(goalSyncIssues.list()).toHaveLength(1);
  });
});
