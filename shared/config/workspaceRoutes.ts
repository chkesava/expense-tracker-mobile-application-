export type WorkspaceType = "expense" | "nutrition";

/**
 * Maps workspace switches to Expo Router destinations.
 * Expense app shell lives under `/(app)` (not legacy `/(tabs)`).
 */
export function resolveWorkspaceRoute(
  workspace: WorkspaceType
): "/(app)" | "/(nutrition)" {
  return workspace === "nutrition" ? "/(nutrition)" : "/(app)";
}
