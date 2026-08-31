export type GaneshSetupMode = "choose" | "create" | "join";
export type GaneshSetupFocus = "active" | "pending" | "rejected" | "removed" | "none";

export function resolveGaneshSetupFocus(input: {
  activeCount: number;
  pendingCount: number;
  rejectedCount: number;
  removedCount: number;
  mode: GaneshSetupMode;
}): GaneshSetupFocus {
  if (input.mode !== "choose") {
    return input.activeCount > 0 ? "active" : "none";
  }
  if (input.activeCount > 0) return "active";
  if (input.pendingCount > 0) return "pending";
  if (input.removedCount > 0) return "removed";
  if (input.rejectedCount > 0) return "rejected";
  return "none";
}

export function ganeshSetupCopy(focus: GaneshSetupFocus): {
  title: string;
  subtitle: string;
  intro: string;
} {
  if (focus === "pending") {
    return {
      title: "Waiting for approval",
      subtitle: "Join request sent",
      intro:
        "Your request is waiting for Admin approval. You will not see expenses, collections, or the Permanent Fund until they accept you.",
    };
  }
  if (focus === "rejected") {
    return {
      title: "Request not approved",
      subtitle: "You can request again",
      intro: "Your request was not approved. You can request again with the Pandal code, or create a new Pandal.",
    };
  }
  if (focus === "removed") {
    return {
      title: "Access ended",
      subtitle: "This Pandal is no longer available",
      intro: "You no longer have access to this Pandal. Request to join again, or create a new Pandal.",
    };
  }
  if (focus === "active") {
    return {
      title: "Welcome back",
      subtitle: "Choose a Pandal",
      intro: "Open a Pandal you already belong to, or join another with a code.",
    };
  }
  return {
    title: "Welcome to Ganesh Seva",
    subtitle: "Create or join a Pandal",
    intro: "Create a new Pandal or join an existing one. You will not see Pandal funds until you are an active member.",
  };
}
