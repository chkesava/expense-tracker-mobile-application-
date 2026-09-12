import { describe, expect, it } from "vitest";

import { chunk } from "@/shared/utils/chunk";

describe("chunk", () => {
  it("splits into fixed-size groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("returns one group when the list is shorter than the size", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it("divides exactly without a trailing empty group", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("never loses or duplicates an item", () => {
    const items = Array.from({ length: 457 }, (_, i) => i);
    const flat = chunk(items, 200).flat();
    expect(flat).toEqual(items);
  });

  it("never exceeds the requested size", () => {
    const items = Array.from({ length: 457 }, (_, i) => i);
    for (const group of chunk(items, 200)) expect(group.length).toBeLessThanOrEqual(200);
  });

  it("rejects a size that would loop forever", () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });
});
