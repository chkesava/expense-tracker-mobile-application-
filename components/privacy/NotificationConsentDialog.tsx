import { Text } from "react-native";

import { Dialog } from "@/components/common/Dialog";
import { useTheme } from "@/theme/ThemeProvider";

type NotificationConsentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
};

export function NotificationConsentDialog({
  isOpen,
  onClose,
  onConfirm,
  confirming,
}: NotificationConsentDialogProps) {
  const { theme } = useTheme();

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Local notifications"
      actions={[
        { label: "Not now", onPress: onClose, variant: "ghost" },
        {
          label: confirming ? "Please wait…" : "I agree, continue",
          onPress: onConfirm,
          variant: "primary",
        },
      ]}
    >
      <Text style={{ color: theme.colors.mutedForeground, fontSize: 14, lineHeight: 21 }}>
        Spendly can show reminders on this device for credit-card bill due dates and for
        bank or UPI transactions detected from SMS. These are local notifications — we do
        not register a cloud push token for this.
        {"\n\n"}
        You can turn notifications off in Settings → Data & privacy or in Android system
        settings.
      </Text>
    </Dialog>
  );
}
