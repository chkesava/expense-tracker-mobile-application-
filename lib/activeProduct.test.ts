import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { WEB_BASE_PATHS, type Product } from "./activeProduct";

const PRODUCTS: Product[] = ["expense", "nutrition", "ganesh"];

describe("WEB_BASE_PATHS", () => {
  it.each(PRODUCTS)("matches products/%s.json's web.basePath", (product) => {
    const file = path.join(__dirname, "..", "products", `${product}.json`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(WEB_BASE_PATHS[product]).toBe(json.web?.basePath);
  });
});
