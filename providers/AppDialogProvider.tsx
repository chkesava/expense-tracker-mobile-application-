import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ActionMenuSheet,
  type ActionMenuItem,
} from "@/components/common/ActionMenuSheet";
import { Dialog, type DialogAction } from "@/components/common/Dialog";
import {
  mapActionMenuItems,
  mapAlertButtonsToDialogActions,
  registerAppDialogHost,
  type AppDialogActionMenuOptions,
  type AppDialogAlertOptions,
} from "@/lib/appDialog";

type AlertState = {
  title: string;
  message?: string;
  actions: DialogAction[];
  dismissible: boolean;
  actionsLayout?: "row" | "stacked";
};

type MenuState = {
  title: string;
  actions: ActionMenuItem[];
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [menuState, setMenuState] = useState<MenuState | null>(null);

  const closeAlert = useCallback(() => setAlertState(null), []);
  const closeMenu = useCallback(() => setMenuState(null), []);

  const showAlert = useCallback(
    (options: AppDialogAlertOptions) => {
      setAlertState({
        title: options.title,
        message: options.message,
        dismissible: options.dismissible ?? true,
        actionsLayout: options.actionsLayout,
        actions: mapAlertButtonsToDialogActions(options.buttons, () => setAlertState(null)),
      });
    },
    []
  );

  const showActionMenu = useCallback((options: AppDialogActionMenuOptions) => {
    setMenuState({
      title: options.title,
      actions: mapActionMenuItems(options.actions),
    });
  }, []);

  const host = useMemo(
    () => ({
      alert: showAlert,
      actionMenu: showActionMenu,
    }),
    [showAlert, showActionMenu]
  );

  useEffect(() => {
    registerAppDialogHost(host);
    return () => registerAppDialogHost(null);
  }, [host]);

  return (
    <>
      {children}
      <Dialog
        isOpen={!!alertState}
        onClose={closeAlert}
        title={alertState?.title ?? ""}
        description={alertState?.message}
        actions={alertState?.actions}
        dismissible={alertState?.dismissible ?? true}
        actionsLayout={alertState?.actionsLayout}
      />
      <ActionMenuSheet
        isOpen={!!menuState}
        onClose={closeMenu}
        title={menuState?.title ?? ""}
        actions={menuState?.actions ?? []}
      />
    </>
  );
}
