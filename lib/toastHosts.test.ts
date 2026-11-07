import { describe, expect, it } from "vitest";

import { activeToastHost, addToastHost, removeToastHost, ROOT_TOAST_HOST } from "./toastHosts";

describe("toast hosts (SPENDLY-708)", () => {
  it("draws in the main view when no sheet is open", () => {
    expect(activeToastHost([])).toBe(ROOT_TOAST_HOST);
  });

  it("draws in the open sheet, so an error raised there is seen", () => {
    expect(activeToastHost(addToastHost([], "sheet-a"))).toBe("sheet-a");
  });

  it("draws in the newest sheet when one opens over another, and only there", () => {
    const hosts = addToastHost(addToastHost([], "sheet-a"), "sheet-b");
    expect(activeToastHost(hosts)).toBe("sheet-b");
    expect(activeToastHost(removeToastHost(hosts, "sheet-b"))).toBe("sheet-a");
  });

  it("goes back to the main view when the sheet closes (a toast still showing carries over)", () => {
    const hosts = removeToastHost(addToastHost([], "sheet-a"), "sheet-a");
    expect(activeToastHost(hosts)).toBe(ROOT_TOAST_HOST);
  });

  it("registers a sheet once, and closing an older sheet keeps the newest in charge", () => {
    const hosts = addToastHost(addToastHost(addToastHost([], "sheet-a"), "sheet-b"), "sheet-a");
    expect(hosts).toEqual(["sheet-a", "sheet-b"]);
    expect(activeToastHost(removeToastHost(hosts, "sheet-a"))).toBe("sheet-b");
  });
});
