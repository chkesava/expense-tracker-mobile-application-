export type WorkspaceType = "expense" | "nutrition" | "ganesh";

/**
 * Maps workspace switches to Expo Router destinations.
 * Expense app shell lives under `/(app)` (not legacy `/(tabs)`).
 */
export function resolveWorkspaceRoute(
  workspace: WorkspaceType
): "/(app)" | "/(nutrition)" | "/(ganesh)" {
  if (workspace === "nutrition") return "/(nutrition)";
  if (workspace === "ganesh") return "/(ganesh)";
  return "/(app)";
}
