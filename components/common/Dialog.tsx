import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button"; // Keep using our bridged Button
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter
} from "@/components/ui/alert-dialog";
import { Text } from "react-native";

export type DialogAction = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "destructive" | "ghost";
  loading?: boolean;
  disabled?: boolean;
};

export type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Row for short confirms; stacked for 3+ actions or explicit long labels. */
  actionsLayout?: "row" | "stacked";
  actions?: DialogAction[];
  /** When false, scrim tap does not dismiss (back still calls onClose). */
  dismissible?: boolean;
};

/** MD3 alert dialog mapped to Gluestack AlertDialog. */
export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
  actionsLayout,
  dismissible = true,
}: DialogProps) {
  const layout =
    actionsLayout ??
    (actions && actions.length > 2 ? "stacked" : "row");

  // Keep existing action styles
  const isStacked = layout === "stacked";

  return (
    <AlertDialog isOpen={isOpen} onClose={dismissible ? onClose : () => {}}>
      <AlertDialogBackdrop />
      <AlertDialogContent className="p-6 bg-card border-none max-w-[400px]">
        <AlertDialogHeader className="mb-2 p-0 border-none">
          <Text className="text-xl font-bold text-foreground">{title}</Text>
        </AlertDialogHeader>
        
        <AlertDialogBody className="mb-4 p-0">
          {description && (
            <Text className="text-sm text-muted-foreground mb-4">{description}</Text>
          )}
          {children}
        </AlertDialogBody>
        
        {actions?.length ? (
          <AlertDialogFooter className="p-0 border-none">
            <View className={`w-full flex ${isStacked ? 'flex-col gap-2' : 'flex-row justify-end gap-2 flex-wrap'}`}>
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant ?? "ghost"}
                  loading={action.loading}
                  disabled={action.disabled}
                  onPress={action.onPress}
                  style={isStacked ? { width: '100%' } : undefined}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          </AlertDialogFooter>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
