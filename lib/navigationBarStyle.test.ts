import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { navigationBarStyleFor } from "@/lib/navigationBarStyle";

describe("navigationBarStyleFor (SPENDLY-174)", () => {
  it("gives dark themes light buttons on a dark scrim", () => {
    expect(navigationBarStyleFor(true)).toBe("light");
  });

  it("gives light themes dark buttons on a light scrim", () => {
    expect(navigationBarStyleFor(false)).toBe("dark");
  });

  it("matches what the native module does with the prop", () => {
    // The mapping above relies on this line. If an upgrade changes it, the
    // scrim flips again, so fail here instead of on a device.
    const native = readFileSync(
      resolve(
        __dirname,
        "../node_modules/expo-navigation-bar/android/src/main/java/expo/modules/navigationbar/NavigationBarModule.kt"
      ),
      "utf8"
    );
    expect(native).toContain('val hasLightBackground = style == "dark"');
  });
});
