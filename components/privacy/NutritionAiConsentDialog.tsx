import { Text } from "react-native";

import { Dialog } from "@/components/common/Dialog";
import { useTheme } from "@/theme/ThemeProvider";

type NutritionAiConsentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
};

export function NutritionAiConsentDialog({
  isOpen,
  onClose,
  onConfirm,
  confirming,
}: NutritionAiConsentDialogProps) {
  const { theme } = useTheme();

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Nutrition AI (Google Gemini)"
      actions={[
        { label: "Not now", onPress: onClose, variant: "ghost" },
        {
          label: confirming ? "Please wait…" : "I agree, analyse food",
          onPress: onConfirm,
          variant: "primary",
        },
      ]}
    >
      <Text style={{ color: theme.colors.mutedForeground, fontSize: 14, lineHeight: 21 }}>
        To estimate nutrients from the food description you type, Spendly sends that text
        to Google Gemini. This processing may happen outside India.
        {"\n\n"}
        Meal logs you save stay in your Spendly account. You can turn Nutrition AI off in
        Settings → Data & privacy. Turning it off stops new sends; existing logs remain
        until you delete them.
      </Text>
    </Dialog>
  );
}
