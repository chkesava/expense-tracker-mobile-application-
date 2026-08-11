import { describe, expect, it } from "vitest";
import { resolveWorkspaceRoute } from "./workspaceRoutes";

describe("resolveWorkspaceRoute", () => {
  it("routes expense workspace to /(app) shell (not legacy /(tabs))", () => {
    expect(resolveWorkspaceRoute("expense")).toBe("/(app)");
  });

  it("routes nutrition workspace to /(nutrition)", () => {
    expect(resolveWorkspaceRoute("nutrition")).toBe("/(nutrition)");
  });
});
