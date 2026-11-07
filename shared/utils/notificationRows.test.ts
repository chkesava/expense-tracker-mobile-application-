import { describe, expect, it } from "vitest";

import { notificationRowHref, recentNotificationRows, timeAgoLabel, toNotificationRow, unreadRowCount } from "./notificationRows";

const ts = (ms: number) => ({ toMillis: () => ms });

describe("toNotificationRow", () => {
  it("reads a SIP row as written today", () => {
    expect(
      toNotificationRow("n1", { id: "n1", type: "sip_failed", title: "SIP Failed", body: "Could not price X.", read: false, createdAt: ts(5), meta: { sipId: "s1" } })
    ).toEqual({ id: "n1", type: "sip_failed", category: null, title: "SIP Failed", body: "Could not price X.", url: null, read: false, createdAtMs: 5, meta: { sipId: "s1" } });
  });

  it("reads a server push row, keeping only a safe in-app link", () => {
    expect(toNotificationRow("n2", { type: "split_paid", category: "shared", title: "Ravi paid", url: "/vaults", read: true, createdAt: "2026-11-06T04:00:00Z" })).toMatchObject({
      category: "shared",
      url: "/vaults",
      read: true,
      createdAtMs: Date.parse("2026-11-06T04:00:00Z"),
    });
    expect(toNotificationRow("n3", { title: "x", url: "https://evil" })?.url).toBeNull();
  });

  it("skips a row with no title", () => {
    expect(toNotificationRow("n4", { body: "x" })).toBeNull();
  });
});

describe("recentNotificationRows and unreadRowCount", () => {
  it("newest first, capped, unread counted", () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, data: { title: `T${i}`, read: i % 2 === 0, createdAt: ts(i) } }));
    const rows = recentNotificationRows(docs, 30);
    expect(rows).toHaveLength(30);
    expect(rows[0].id).toBe("n39");
    expect(unreadRowCount(rows)).toBe(15);
  });
});

describe("notificationRowHref", () => {
  it("uses the row's link, or the investments screen for SIP rows", () => {
    expect(notificationRowHref(toNotificationRow("a", { title: "t", url: "/epf/e1" })!)).toBe("/epf/e1");
    expect(notificationRowHref(toNotificationRow("b", { title: "t", type: "sip_executed" })!)).toBe("/investments");
    expect(notificationRowHref(toNotificationRow("c", { title: "t", type: "info" })!)).toBeNull();
  });
});

describe("timeAgoLabel", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  it("reads naturally", () => {
    expect(timeAgoLabel(now - 30_000, now)).toBe("Just now");
    expect(timeAgoLabel(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(timeAgoLabel(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(timeAgoLabel(now - 26 * 3_600_000, now)).toBe("Yesterday");
    expect(timeAgoLabel(now - 4 * 86_400_000, now)).toBe("4 days ago");
    expect(timeAgoLabel(now - 20 * 86_400_000, now)).toBe("17 Oct");
    expect(timeAgoLabel(0, now)).toBe("");
  });
});
