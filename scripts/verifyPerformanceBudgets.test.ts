import { describe, expect, it } from "vitest";
import { verifyStartupGuardrails } from "./verify-performance-budgets";

describe("verifyStartupGuardrails", () => {
  it("executes cleanly against the current codebase with zero violations", () => {
    const result = verifyStartupGuardrails();
    expect(result).toBe(true);
  });
});
