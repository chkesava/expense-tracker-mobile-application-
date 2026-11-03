import { execSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SPENDLY-661: a bare `onPress={Keyboard.dismiss}` on a form wrapper blurs
 * every field on web the moment it is clicked (react-native-web's dismiss
 * blurs the focused input), so nothing can be typed. Forms use
 * `dismissKeyboardOnNative` from lib/keyboardDismiss instead.
 */

const ROOT = path.resolve(__dirname, "..");

function matches(pattern: string): string[] {
  try {
    return execSync(`git grep -n -E "${pattern}" -- "*.tsx" "*.ts"`, { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith("lib/keyboardDismiss"));
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
}

describe("keyboard dismiss on web (SPENDLY-661)", () => {
  it("no component passes Keyboard.dismiss straight to an onPress", () => {
    expect(matches(String.raw`onPress=\{\s*Keyboard\.dismiss\s*\}`)).toEqual([]);
    expect(matches(String.raw`onPress=\{\s*\(\)\s*=>\s*Keyboard\.dismiss\(\)\s*\}`)).toEqual([]);
  });

  it("the Add Holding and Buy/Sell forms use the native-only handler", () => {
    const users = matches("dismissKeyboardOnNative").map((l) => l.split(":")[0]);
    expect(new Set(users)).toEqual(new Set(["components/portfolio/AddHoldingModal.tsx", "components/portfolio/MockTradeModal.tsx"]));
  });
});
