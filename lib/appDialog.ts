import type { DialogAction } from "@/components/common/Dialog";
import type { ActionMenuItem } from "@/components/common/ActionMenuSheet";

export type AppDialogButtonStyle = "default" | "cancel" | "destructive";

export type AppDialogButton = {
  text: string;
  style?: AppDialogButtonStyle;
  onPress?: () => void;
};

export type AppDialogAlertOptions = {
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
  dismissible?: boolean;
  actionsLayout?: "row" | "stacked";
};

export type AppDialogActionMenuOptions = {
  title: string;
  actions: Array<{
    text: string;
    style?: Exclude<AppDialogButtonStyle, "cancel">;
    onPress?: () => void;
    disabled?: boolean;
  }>;
};

export type AppDialogHost = {
  alert: (options: AppDialogAlertOptions) => void;
  actionMenu: (options: AppDialogActionMenuOptions) => void;
};

let host: AppDialogHost | null = null;

export function registerAppDialogHost(next: AppDialogHost | null) {
  host = next;
}

function defer(fn: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(fn);
    return;
  }
  setTimeout(fn, 0);
}

/** Map Alert-style buttons onto Dialog actions (cancel → ghost, etc.). */
export function mapAlertButtonsToDialogActions(
  buttons: AppDialogButton[] | undefined,
  close: () => void
): DialogAction[] {
  const list =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: "OK", style: "default" as const }];

  const primaryDefaults = list.filter(
    (b) => b.style !== "cancel" && b.style !== "destructive"
  );
  const primaryLabel = primaryDefaults.at(-1)?.text;

  return list.map((button) => {
    let variant: DialogAction["variant"] = "ghost";
    if (button.style === "destructive") {
      variant = "destructive";
    } else if (button.style === "cancel") {
      variant = "ghost";
    } else if (list.length === 1 || button.text === primaryLabel) {
      variant = "primary";
    }

    return {
      label: button.text,
      variant,
      onPress: () => {
        close();
        // Defer so dialog unmounts before opening another modal.
        defer(() => {
          button.onPress?.();
        });
      },
    };
  });
}

export function mapActionMenuItems(
  actions: AppDialogActionMenuOptions["actions"]
): ActionMenuItem[] {
  return actions.map((action) => ({
    label: action.text,
    destructive: action.style === "destructive",
    disabled: action.disabled,
    onPress: () => {
      action.onPress?.();
    },
  }));
}

/**
 * Imperative Spendly dialog API (Alert.alert replacement).
 * Requires AppDialogProvider to be mounted.
 */
export const appDialog = {
  alert(title: string, message?: string, buttons?: AppDialogButton[]): void {
    if (!host) {
      if (__DEV__) {
        console.warn("[appDialog] Provider not mounted; dropping alert:", title);
      }
      return;
    }
    host.alert({ title, message, buttons });
  },

  show(options: AppDialogAlertOptions): void {
    if (!host) {
      if (__DEV__) {
        console.warn("[appDialog] Provider not mounted; dropping alert:", options.title);
      }
      return;
    }
    host.alert(options);
  },

  actionMenu(title: string, actions: AppDialogActionMenuOptions["actions"]): void {
    if (!host) {
      if (__DEV__) {
        console.warn("[appDialog] Provider not mounted; dropping action menu:", title);
      }
      return;
    }
    host.actionMenu({ title, actions });
  },
};
