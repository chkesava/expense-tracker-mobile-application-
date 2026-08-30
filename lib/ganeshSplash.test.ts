import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Ganesh splash product config", () => {
  it("uses maroon native splash and web boot colors", () => {
    const json = JSON.parse(read("products/ganesh.json"));
    expect(json.splashBackgroundColor).toBe("#3D1224");
    expect(json.splashImageWidth).toBe(200);
    expect(json.splashImage).toBe("./assets/branding/ganesh-pandal-splash-logo.png");
    expect(json.web.backgroundColor).toBe("#3D1224");
    expect(json.web.themeColor).toBe("#F97316");
  });

  it("does not change Expense or Nutrition splash branding", () => {
    const expense = JSON.parse(read("products/expense.json"));
    const nutrition = JSON.parse(read("products/nutrition.json"));
    expect(expense.splashBackgroundColor).toBeUndefined();
    expect(nutrition.splashBackgroundColor).toBeUndefined();
    expect(nutrition.splashImage).toBe("./assets/branding/nutrition-splash-logo.png");
    expect(expense.web.backgroundColor).toBe("#071A2B");
    expect(nutrition.web.backgroundColor).toBe("#071A2B");
  });
});

describe("product splash overlay isolation", () => {
  it("aliases Ganesh and default overlays in Metro", () => {
    const metro = read("metro.config.js");
    expect(metro).toContain("product-splash-overlay");
    expect(metro).toContain("GaneshSplashOverlay.tsx");
    expect(metro).toContain("DefaultSplashOverlay.tsx");
    expect(metro).toContain("WorkspaceSplashOverlay.tsx");
    expect(metro).toContain("splash-logo.png");
  });

  it("keeps the Expense overlay hardcoded to the Spendly logo", () => {
    const overlay = read("components/common/SplashAnimationOverlay.tsx");
    expect(overlay).toContain("splash-logo.png");
    expect(overlay).toContain("#0F2F4B");
    expect(overlay).not.toContain("ganesh-emblem");
    expect(overlay).not.toContain("Ganesh Seva");
  });

  it("does not load the Expense splash logo from the Ganesh overlay", () => {
    const overlay = read("components/ganesh/splash/GaneshSplashOverlay.tsx");
    expect(overlay).toContain("ganesh-emblem.webp");
    expect(overlay).toContain("Ganesh Seva");
    expect(overlay).toContain("Seva. Sangathan. Samruddhi.");
    expect(overlay).toContain("prefetchGaneshStartup");
    expect(overlay).not.toContain("splash-logo.png");
    expect(overlay).not.toContain("Spendly");
  });

  it("holds the Ganesh splash for five to six seconds", () => {
    const theme = read("components/ganesh/splash/ganeshSplashTheme.ts");
    expect(theme).toMatch(/GANESH_SPLASH_MIN_MS = 5[0-9]{3}/);
    const overlay = read("components/common/SplashAnimationOverlay.tsx");
    expect(overlay).toContain(", 450)");
  });

  it("wires the product overlay from the root layout", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).toContain('from "product-splash-overlay"');
    expect(layout).toContain("(showGaneshSplash || showDefaultSplash)");
    expect(layout).not.toContain("SplashAnimationOverlay");
  });
});
