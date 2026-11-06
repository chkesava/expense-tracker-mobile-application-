import { describe, expect, it } from "vitest";

import { INBOX_PATH, isSafeInAppPath, resolveNotificationRoute, shouldShowBanner } from "./notificationRoutes";

const push = (url: unknown, over: Record<string, unknown> = {}) => ({ product: "expense", category: "bills", kind: "bill_due", url, entityId: "b1", ...over });

describe("resolveNotificationRoute", () => {
  it("keeps routing the local reminders as before", () => {
    expect(resolveNotificationRoute({ source: "credit_card_bill", billId: "b1", url: "/credit-card-bills/b1" })).toEqual({ href: "/credit-card-bills/b1", fallback: false });
    expect(resolveNotificationRoute({ source: "calendar", url: "/calendar?focus=reminder:r1:2026-11-06&date=2026-11-06" })?.href).toContain("/calendar?");
    expect(resolveNotificationRoute({ source: "goal", url: "/goals/g1" })?.href).toBe("/goals/g1");
  });

  it("routes a Spendly push to an allowed screen", () => {
    expect(resolveNotificationRoute(push("/credit-card-bills/b1"))).toEqual({ href: "/credit-card-bills/b1", fallback: false });
    expect(resolveNotificationRoute(push("/investments", { category: "investments" }))?.href).toBe("/investments");
    expect(resolveNotificationRoute(push("/epf/est1", { category: "investments" }))?.href).toBe("/epf/est1");
  });

  it("opens the inbox for a Spendly push whose link isn't allowed", () => {
    for (const url of ["https://evil.example", "//evil.example/x", "/../settings", "/admin", "/credit-card-billsX", "javascript:alert(1)", 42]) {
      expect(resolveNotificationRoute(push(url))).toEqual({ href: INBOX_PATH, fallback: true });
    }
  });

  it("ignores other products, unknown categories and unknown local sources", () => {
    expect(resolveNotificationRoute(push("/credit-card-bills/b1", { product: "ganesh" }))).toBeNull();
    expect(resolveNotificationRoute(push("/credit-card-bills/b1", { category: "pandal" }))).toBeNull();
    expect(resolveNotificationRoute({ source: "sms", url: "/transactions" })).toBeNull();
    expect(resolveNotificationRoute({ source: "goal", url: "https://x" })).toBeNull();
    expect(resolveNotificationRoute(null)).toBeNull();
  });
});

describe("isSafeInAppPath", () => {
  it("accepts plain in-app paths with a simple query", () => {
    expect(isSafeInAppPath("/calendar?focus=a:b&date=2026-11-06")).toBe(true);
    expect(isSafeInAppPath("/goals/g1")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const u of ["", "goals", "//x", "/a/../b", "/a b", "/a<script>", "http://x"]) expect(isSafeInAppPath(u)).toBe(false);
  });
});

describe("shouldShowBanner", () => {
  it("hides the banner when the user is already on that screen", () => {
    expect(shouldShowBanner(push("/credit-card-bills/b1"), "/credit-card-bills/b1")).toBe(false);
    expect(shouldShowBanner({ source: "calendar", url: "/calendar?date=x" }, "/calendar")).toBe(false);
  });
  it("shows it everywhere else, and when the screen is unknown", () => {
    expect(shouldShowBanner(push("/credit-card-bills/b1"), "/dashboard")).toBe(true);
    expect(shouldShowBanner(push("/credit-card-bills/b1"), null)).toBe(true);
    expect(shouldShowBanner(push("https://x"), INBOX_PATH)).toBe(true);
    expect(shouldShowBanner({ product: "ganesh" }, "/x")).toBe(true);
  });
});
