import { Dialog } from "@/components/common/Dialog";
import { Text } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type SmsConsentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
};

export function SmsConsentDialog({
  isOpen,
  onClose,
  onConfirm,
  confirming,
}: SmsConsentDialogProps) {
  const { theme } = useTheme();

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="SMS access for transaction tracking"
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
        Spendly can read SMS on this Android device to detect bank and UPI debit or credit
        messages and turn them into expenses or income.
        {"\n\n"}
        Raw SMS (full message, sender, timestamp) stays on this device and is not uploaded.
        OTP and personal messages are skipped. Only parsed amount, merchant, and date may
        be saved to your ledger.
        {"\n\n"}
        You can turn this off anytime in Settings. Turning it off withdraws this consent
        and clears the local SMS review queue. Ledger entries already saved stay until you
        delete them.
      </Text>
    </Dialog>
  );
}
