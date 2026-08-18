import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type ConsentCheckboxesProps = {
  isAdult: boolean;
  onAdultChange: (value: boolean) => void;
  acceptedLegal: boolean;
  onAcceptedLegalChange: (value: boolean) => void;
  onOpenNotice: () => void;
  onOpenTerms: () => void;
};

export function ConsentCheckboxes({
  isAdult,
  onAdultChange,
  acceptedLegal,
  onAcceptedLegalChange,
  onOpenNotice,
  onOpenTerms,
}: ConsentCheckboxesProps) {
  const { theme } = useTheme();

  return (
    <View style={{ gap: 12 }}>
      <CheckRow
        checked={isAdult}
        onToggle={() => onAdultChange(!isAdult)}
        label="I confirm that I am 18 years of age or older."
      />
      <CheckRow
        checked={acceptedLegal}
        onToggle={() => onAcceptedLegalChange(!acceptedLegal)}
        labelPrefix="I have read the "
        linkLabel="Privacy Notice"
        onLinkPress={onOpenNotice}
        midLabel=" and agree to the "
        secondLinkLabel="Terms of Use"
        onSecondLinkPress={onOpenTerms}
        labelSuffix="."
      />
      <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
        Required consents are not pre-ticked. You can withdraw optional consents later in
        Settings. Withdrawing core processing requires deleting your account.
      </Text>
    </View>
  );
}

function CheckRow({
  checked,
  onToggle,
  label,
  labelPrefix,
  linkLabel,
  onLinkPress,
  midLabel,
  secondLinkLabel,
  onSecondLinkPress,
  labelSuffix,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
  labelPrefix?: string;
  linkLabel?: string;
  onLinkPress?: () => void;
  midLabel?: string;
  secondLinkLabel?: string;
  onSecondLinkPress?: () => void;
  labelSuffix?: string;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderCurve: "continuous",
          borderWidth: 2,
          borderColor: checked ? theme.colors.primary : theme.colors.border,
          backgroundColor: checked ? theme.colors.primary : "transparent",
          marginTop: 1,
        }}
      />
      <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 14, lineHeight: 20 }}>
        {label ? (
          label
        ) : (
          <>
            {labelPrefix}
            <Text
              onPress={onLinkPress}
              style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }}
            >
              {linkLabel}
            </Text>
            {midLabel}
            <Text
              onPress={onSecondLinkPress}
              style={{ color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }}
            >
              {secondLinkLabel}
            </Text>
            {labelSuffix}
          </>
        )}
      </Text>
    </Pressable>
  );
}
