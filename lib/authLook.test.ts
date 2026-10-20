import { describe, expect, it } from "vitest";

import { createTheme } from "@/theme/tokens";
import { authPalette, legacyAuthBackground, socialButtonPalette, usesExpenseLook } from "./authLook";

describe("auth look (SPENDLY-556)", () => {
  it("is Expense's for the Expense and combined builds only", () => {
    expect(usesExpenseLook("expense")).toBe(true);
    expect(usesExpenseLook(null)).toBe(true);
    expect(usesExpenseLook("nutrition")).toBe(false);
    expect(usesExpenseLook("ganesh")).toBe(false);
  });

  it("follows the theme for Expense, in light and dark", () => {
    for (const name of ["midnight-emerald", "light"] as const) {
      const theme = createTheme(name);
      const p = authPalette(theme, true);
      expect(p.title).toBe(theme.colors.foreground);
      expect(p.surface).toBe(theme.colors.card);
      expect(p.cta).toEqual([theme.colors.primary, theme.colors.primary]);
      expect(p.ctaText).toBe(theme.colors.primaryForeground);
      expect(socialButtonPalette(theme, true).text).toBe(theme.colors.foreground);
    }
  });

  it("keeps the exact pre-556 colours for the other products", () => {
    const light = createTheme("light");
    expect(authPalette(light, false)).toEqual({
      title: "#0B172A",
      muted: "#64748B",
      icon: "#64748B",
      surface: "#FFFFFF",
      surfaceBorder: "#F1F5F9",
      surfaceShadow: "#0875D1",
      link: "#19C79A",
      linkDisabled: "#94A3B8",
      divider: "#E2E8F0",
      dividerText: "#94A3B8",
      cta: ["#0875D1", "#19C79A"],
      ctaText: "#FFFFFF",
    });
    expect(socialButtonPalette(light, false)).toEqual({ background: "#FFFFFF", border: "#E2E8F0", text: "#0F172A" });
    expect(legacyAuthBackground(light).base).toEqual(["#F6F9FC", "#FFFFFF"]);
  });

  it("keeps the old dark detection for the other products", () => {
    const old = createTheme("light");
    const darkBg = { ...old, colors: { ...old.colors, background: "#020817" } };
    expect(authPalette(darkBg, false).surface).toBe("#1E293B");
    expect(socialButtonPalette(darkBg, false).text).toBe("#FFFFFF");
    expect(legacyAuthBackground(darkBg).dot).toBe("rgba(255,255,255,0.05)");
  });
});
